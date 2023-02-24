/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { SetRequired } from '../core/ModelUtils';

export interface AdminPriceListDeleteBatchRes {
  ids: Array<string>;  /**
   * The type of the object that was deleted.
   */
  object: string;  /**
   * Whether or not the items were deleted.
   */
  deleted: boolean;};

