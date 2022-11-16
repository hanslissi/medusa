const path = require("path")

const { createDatabase, dropDatabase } = require("pg-god")
const { createConnection, getConnection } = require("typeorm")

const DB_HOST = "localhost"
const DB_USERNAME = "postgres"
const DB_PASSWORD = ""
const DB_URL = `postgres://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}`

const pgGodCredentials = {
  user: DB_USERNAME,
  password: DB_PASSWORD,
  host: DB_HOST,
}

class DatabaseFactory {
  constructor() {
    this.connection_ = null
    this.masterConnectionName = "master"
    this.templateDbName = "medusa-integration-template"
  }

  async createTemplateDb_({ cwd }) {
    // const cwd = path.resolve(path.join(__dirname, ".."))
    const connection = await this.getMasterConnection()
    const migrationDir = path.resolve(
      path.join(__dirname, "../", "../", "migrations", "*.js")
    )

    const { getEnabledMigrations } = require(path.join(
      __dirname,
      "../",
      "../",
      "commands",
      "utils",
      "get-migrations"
    ))

    // filter migrations to only include those that dont have feature flags
    const enabledMigrations = await getEnabledMigrations(
      [migrationDir],
      (flag) => false
    )

    await dropDatabase(
      {
        databaseName: this.templateDbName,
        errorIfNonExist: false,
      },
      pgGodCredentials
    )
    await createDatabase(
      { databaseName: this.templateDbName },
      pgGodCredentials
    )

    const templateDbConnection = await createConnection({
      type: "postgres",
      name: "templateConnection",
      url: `${DB_URL}/${this.templateDbName}`,
      migrations: enabledMigrations,
    })

    await templateDbConnection.runMigrations()
    await templateDbConnection.close()

    return connection
  }

  async getMasterConnection() {
    try {
      return await getConnection(this.masterConnectionName)
    } catch (err) {
      return await this.createMasterConnection()
    }
  }

  async createMasterConnection() {
    return await createConnection({
      type: "postgres",
      name: this.masterConnectionName,
      url: `${DB_URL}`,
    })
  }

  async createFromTemplate(dbName) {
    const connection = await this.getMasterConnection()

    await connection.query(`DROP DATABASE IF EXISTS "${dbName}";`)
    await connection.query(`CREATE DATABASE "${dbName}";`)
  }
}

module.exports = new DatabaseFactory()