export const receiptSupplier = "CORP. G.S. S.A.";
export const receiptInterestBps = 200;
export const receiptInterest = (cents: number) =>
  Math.round((cents * receiptInterestBps) / 10000);
