/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { SetRequired } from '../core/ModelUtils';

export interface AdminPostOrderEditsReq {
  /**
   * The ID of the order to create the edit for.
   */
  order_id: string;  /**
   * An optional note to create for the order edit.
   */
  internal_note?: string;};

