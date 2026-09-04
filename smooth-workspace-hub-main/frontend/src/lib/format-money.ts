const indianNumberFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: unknown, currency = "INR") {
  const amount = Number(value ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const code = String(currency || "INR").toUpperCase();
  const formatted = indianNumberFormatter.format(safeAmount);

  return code === "INR" ? `Rs ${formatted}` : `${code} ${formatted}`;
}
