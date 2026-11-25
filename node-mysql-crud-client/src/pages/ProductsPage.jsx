import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
} from '../api/products'
import AppHeader from '../components/AppHeader'
import DeleteProductDialog from '../components/DeleteProductDialog'
import NotificationSnackbar from '../components/NotificationSnackbar'
import ProductCatalog from '../components/ProductCatalog'
import ProductForm from '../components/ProductForm'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState({ message: '', severity: 'success' })

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setProducts(await getProducts())
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    getProducts()
      .then((data) => {
        if (active) setProducts(data)
      })
      .catch((error) => {
        if (active) setLoadError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return products

    return products.filter((product) =>
      [product.name, product.sku, String(product.id)].some((value) =>
        String(value).toLowerCase().includes(query),
      ),
    )
  }, [products, search])

  const showNotice = (message, severity = 'success') => {
    setNotice({ message, severity })
  }

  const openCreateForm = () => {
    setEditingProduct(null)
    setFormOpen(true)
  }

  const openEditForm = (product) => {
    setEditingProduct(product)
    setFormOpen(true)
  }

  const closeForm = () => {
    if (saving) return
    setFormOpen(false)
    setEditingProduct(null)
  }

  const saveProduct = async (values) => {
    setSaving(true)
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, values)
        showNotice('Product updated successfully.')
      } else {
        await createProduct(values)
        showNotice('Product added successfully.')
      }

      setFormOpen(false)
      setEditingProduct(null)
      await loadProducts()
    } catch (error) {
      showNotice(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingProduct) return

    setDeleting(true)
    try {
      await deleteProduct(deletingProduct.id)
      showNotice('Product deleted successfully.')
      setDeletingProduct(null)
      await loadProducts()
    } catch (error) {
      showNotice(error.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const closeNotice = () => {
    setNotice((current) => ({ ...current, message: '' }))
  }

  return (
    <Box className="app-shell">
      <AppHeader />

      <Box component="main" className="main-content">
        <Box className="page-heading">
          <Box>
            {/* <Typography className="eyebrow">OVERVIEW</Typography>
            <Typography component="h1" className="page-title">
              Products
            </Typography>
            <Typography color="text.secondary">
              Keep your inventory organized and up to date.
            </Typography> */}
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddRoundedIcon />}
            onClick={openCreateForm}
            className="add-button"
          >
            Add product
          </Button>
        </Box>

        <ProductForm
          open={formOpen}
          product={editingProduct}
          saving={saving}
          onClose={closeForm}
          onSave={saveProduct}
        />

        <ProductCatalog
          products={products}
          filteredProducts={filteredProducts}
          loading={loading}
          search={search}
          loadError={loadError}
          onSearchChange={setSearch}
          onRefresh={loadProducts}
          onAdd={openCreateForm}
          onEdit={openEditForm}
          onDelete={setDeletingProduct}
        />

        <Typography className="footer-note">
          A clear view of everything you have in stock.
        </Typography>
      </Box>

      <DeleteProductDialog
        product={deletingProduct}
        deleting={deleting}
        onClose={() => setDeletingProduct(null)}
        onConfirm={confirmDelete}
      />
      <NotificationSnackbar notice={notice} onClose={closeNotice} />
    </Box>
  )
}
