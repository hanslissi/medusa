/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Typing utilities from https://github.com/sindresorhus/type-fest
 */

export type Simplify<T> = {[KeyType in keyof T]: T[KeyType]} & {};

export type IsEqual<A, B> =
  (<G>() => G extends A ? 1 : 2) extends
  (<G>() => G extends B ? 1 : 2)
    ? true
    : false;

type Filter<KeyType, ExcludeType> = IsEqual<KeyType, ExcludeType> extends true ? never : (KeyType extends ExcludeType ? never : KeyType);

export type Except<ObjectType, KeysType extends keyof ObjectType> = {
  [KeyType in keyof ObjectType as Filter<KeyType, KeysType>]: ObjectType[KeyType];
};

export type SetRequired<BaseType, Keys extends keyof BaseType> =
  Simplify<
  // Pick just the keys that are optional from the base type.
  Except<BaseType, Keys> &
  // Pick the keys that should be required from the base type and make them required.
  Required<Pick<BaseType, Keys>>
  >;

export type SetNonNullable<BaseType, Keys extends keyof BaseType = keyof BaseType> = {
  [Key in keyof BaseType]: Key extends Keys
    ? NonNullable<BaseType[Key]>
    : BaseType[Key];
};
