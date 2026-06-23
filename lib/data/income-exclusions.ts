/** Handled transaction IDs omitted from the income tracker (duplicate closings, etc.). */
export const EXCLUDED_INCOME_TRANSACTION_IDS = new Set([
  // Duplicate of 13213 Manor Blvd (manual import closes 6/17; Handled had 6/26).
  "8c9f1c06-0290-460d-9b9e-27e76bb6645b",
  // Duplicate of 408 Coyote Trail (sheet closes 7/17; Handled had 7/3).
  "a6b26460-d65c-4007-957a-111cd0c8b2f5",
]);
