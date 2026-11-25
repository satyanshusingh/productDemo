import { Alert, Box, Button, Paper, Typography } from '@mui/material'
import ProductToolbar from './ProductToolbar'
import ProductsTable from './ProductsTable'

export default function ProductCatalog({
  products,
  filteredProducts,
  loading,
  search,
  loadError,
  onSearchChange,
  onRefresh,
  onAdd,
  onEdit,
  onDelete,
}) {
  return (
    <Paper className="catalog-card" elevation={0}>
      <ProductToolbar
        productCount={products.length}
        search={search}
        loading={loading}
        onSearchChange={onSearchChange}
        onRefresh={onRefresh}
      />

      {loadError && (
        <Alert
          severity="error"
          className="load-alert"
          action={
            <Button color="inherit" size="small" onClick={onRefresh}>
              Try again
            </Button>
          }
        >
          Could not load products: {loadError}
        </Alert>
      )}

      <ProductsTable
        products={filteredProducts}
        loading={loading}
        search={search}
        loadError={loadError}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      <Box className="table-footer">
        <Typography variant="caption" color="text.secondary">
          Showing {filteredProducts.length} of {products.length} products
        </Typography>
      </Box>
    </Paper>
  )
}
