import { z } from 'zod'

export const emptyProduct = {
  sku: '',
  name: '',
  price: '',
  stock: '',
}

export const productSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3, 'SKU must be at least 3 characters')
    .max(32, 'SKU must be 32 characters or fewer')
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores'),
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be 100 characters or fewer'),
  price: z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, 'Enter a valid price (up to 2 decimals)')
    .refine((value) => Number(value) <= 99999999.99, 'Price is too high'),
  stock: z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)$/, 'Stock must be a whole number')
    .refine((value) => Number(value) > 0, 'Stock cannot be zero')
    .refine((value) => Number(value) <= 4294967295, 'Stock is too high'),
})

export function toProductPayload(values) {
  return {
    sku: values.sku.trim(),
    name: values.name.trim(),
    price: Number(values.price).toFixed(2),
    stock: Number(values.stock),
  }
}
