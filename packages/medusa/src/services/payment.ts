import { MedusaError } from "medusa-core-utils"
import { EntityManager } from "typeorm"
import { PaymentRepository } from "./../repositories/payment"

import { IEventBusService, TransactionBaseService } from "../interfaces"
import { Payment, Refund } from "../models"
import { FindConfig } from "../types/common"
import { buildQuery } from "../utils"
import { PaymentProviderService } from "./index"

type InjectedDependencies = {
  manager: EntityManager
  paymentProviderService: PaymentProviderService
  eventBusService: IEventBusService
  paymentRepository: typeof PaymentRepository
}

export type PaymentDataInput = {
  currency_code: string
  provider_id: string
  amount: number
  data: Record<string, unknown>
}

export default class PaymentService extends TransactionBaseService {
  protected readonly manager_: EntityManager
  protected transactionManager_: EntityManager | undefined
  protected readonly eventBusService_: IEventBusService
  protected readonly paymentProviderService_: PaymentProviderService
  protected readonly paymentRepository_: typeof PaymentRepository
  static readonly Events = {
    CREATED: "payment.created",
    UPDATED: "payment.updated",
    PAYMENT_CAPTURED: "payment.payment_captured",
    PAYMENT_CAPTURE_FAILED: "payment.payment_capture_failed",
    REFUND_CREATED: "payment.payment_refund_created",
    REFUND_FAILED: "payment.payment_refund_failed",
  }

  constructor({
    manager,
    paymentRepository,
    paymentProviderService,
    eventBusService,
  }: InjectedDependencies) {
    // eslint-disable-next-line prefer-rest-params
    super(arguments[0])

    this.manager_ = manager
    this.paymentRepository_ = paymentRepository
    this.paymentProviderService_ = paymentProviderService
    this.eventBusService_ = eventBusService
  }

  async retrieve(
    paymentId: string,
    config: FindConfig<Payment> = {}
  ): Promise<Payment> {
    const manager = this.transactionManager_ ?? this.manager_
    const paymentRepository = manager.getCustomRepository(
      this.paymentRepository_
    )

    const query = buildQuery({ id: paymentId }, config)

    const payment = await paymentRepository.find(query)

    if (!payment.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Payment with id ${paymentId} was not found`
      )
    }

    return payment[0]
  }

  async create(paymentInput: PaymentDataInput): Promise<Payment> {
    return await this.atomicPhase_(async (manager: EntityManager) => {
      const { data, currency_code, amount, provider_id } = paymentInput

      const paymentRepository = manager.getCustomRepository(
        this.paymentRepository_
      )

      const created = paymentRepository.create({
        provider_id,
        amount,
        currency_code,
        data,
      })

      const saved = await paymentRepository.save(created)

      await this.eventBusService_
        .withTransaction(manager)
        .emit(PaymentService.Events.CREATED, saved)

      return saved
    })
  }

  async update(
    paymentId: string,
    data: { order_id?: string; swap_id?: string }
  ): Promise<Payment> {
    return await this.atomicPhase_(async (manager: EntityManager) => {
      const payment = await this.retrieve(paymentId)

      const paymentRepository = manager.getCustomRepository(
        this.paymentRepository_
      )

      if (data?.order_id) {
        payment.order_id = data.order_id
      }

      if (data?.swap_id) {
        payment.swap_id = data.swap_id
      }

      const updated = await paymentRepository.save(payment)

      await this.eventBusService_
        .withTransaction(manager)
        .emit(PaymentService.Events.UPDATED, updated)

      return updated
    })
  }

  async capture(paymentOrId: string | Payment): Promise<Payment> {
    const payment =
      typeof paymentOrId === "string"
        ? await this.retrieve(paymentOrId)
        : paymentOrId

    if (payment?.captured_at) {
      return payment
    }

    return await this.atomicPhase_(async (manager: EntityManager) => {
      let captureError: Error | null = null
      const capturedPayment = await this.paymentProviderService_
        .withTransaction(manager)
        .capturePayment(payment)
        .catch((err) => {
          captureError = err
        })

      if (!capturedPayment) {
        await this.eventBusService_
          .withTransaction(manager)
          .emit(PaymentService.Events.PAYMENT_CAPTURE_FAILED, {
            ...payment,
            error: captureError,
          })

        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `Failed to capture Payment ${payment.id}`
        )
      }

      await this.eventBusService_
        .withTransaction(manager)
        .emit(PaymentService.Events.PAYMENT_CAPTURED, capturedPayment)

      return capturedPayment
    })
  }

  async refund(
    paymentOrId: string | Payment,
    amount: number,
    reason: string,
    note?: string
  ): Promise<Refund> {
    const payment =
      typeof paymentOrId === "string"
        ? await this.retrieve(paymentOrId)
        : paymentOrId

    return await this.atomicPhase_(async (manager: EntityManager) => {
      if (!payment.captured_at) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Payment ${payment.id} is not captured`
        )
      }

      const refundable = payment.amount - payment.amount_refunded
      if (amount > refundable) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Only ${refundable} can be refunded from Payment ${payment.id}`
        )
      }

      let refundError: Error | null = null
      const refund = await this.paymentProviderService_
        .withTransaction(manager)
        .refundFromPayment(payment, amount, reason, note)
        .catch((err) => {
          refundError = err
        })

      if (!refund) {
        await this.eventBusService_
          .withTransaction(manager)
          .emit(PaymentService.Events.REFUND_FAILED, {
            ...payment,
            error: refundError,
          })

        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `Failed to refund Payment ${payment.id}`
        )
      }

      await this.eventBusService_
        .withTransaction(manager)
        .emit(PaymentService.Events.REFUND_CREATED, refund)

      return refund
    })
  }
}