/**
 * ----------------------------------------
 * Order Status List
 * ----------------------------------------
 */

export const ORDER_STATUS = Object.freeze([
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

/**
 * ----------------------------------------
 * Internal Status Set
 * ----------------------------------------
 */

const STATUS_SET = new Set(ORDER_STATUS);

/**
 * ----------------------------------------
 * Validate Order Status
 * ----------------------------------------
 *
 * @param {string} status
 * @returns {boolean}
 * ----------------------------------------
 */

const isValidStatus = (status) => {
  if (typeof status !== "string") {
    return false;
  }

  return STATUS_SET.has(status.trim().toLowerCase());
};

export default isValidStatus;
