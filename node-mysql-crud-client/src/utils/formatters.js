const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-IN')

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value))
}

export function formatNumber(value) {
  return numberFormatter.format(Number(value))
}

export function getInventorySummary(products) {
  return products.reduce(
    (summary, product) => {
      summary.totalStock += Number(product.stock)
      summary.inventoryValue += Number(product.price) * Number(product.stock)
      return summary
    },
    { totalStock: 0, inventoryValue: 0 },
  )
}
