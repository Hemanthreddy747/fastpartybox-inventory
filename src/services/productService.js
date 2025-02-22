export const validateProduct = (product) => {
  const errors = [];
  
  // Product Name: Required, non-empty string
  if (!product.productName?.trim()) {
    errors.push("Product Name is required");
  } else if (product.productName.length > 100) {
    errors.push("Product Name must be less than 100 characters");
  }
  
  // My Bulk Purchase Price: Required, non-negative number with 2 decimal places
  if (isNaN(parseFloat(product.purchasePrice))) {
    errors.push("My Bulk Purchase Price is required");
  } else if (product.purchasePrice < 0) {
    errors.push("My Bulk Purchase Price cannot be negative");
  }
  // Price decimal validation
  if (product.purchasePrice && !(/^\d+(\.\d{0,2})?$/.test(product.purchasePrice.toString()))) {
    errors.push("Purchase Price cannot have more than 2 decimal places");
  }
  
  // MRP: Required, non-negative, must be >= Bulk Purchase Price
  if (isNaN(parseFloat(product.mrp))) {
    errors.push("MRP is required");
  } else if (product.mrp < 0) {
    errors.push("MRP cannot be negative");
  } else if (parseFloat(product.mrp) < parseFloat(product.purchasePrice)) {
    errors.push("MRP cannot be less than My Bulk Purchase Price");
  }
  // Price decimal validation
  if (product.mrp && !(/^\d+(\.\d{0,2})?$/.test(product.mrp.toString()))) {
    errors.push("MRP cannot have more than 2 decimal places");
  }
  
  // Retail Selling Price: Required, non-negative, must be <= MRP
  if (isNaN(parseFloat(product.retailPrice))) {
    errors.push("Retail Selling Price is required");
  } else if (product.retailPrice < 0) {
    errors.push("Retail Selling Price cannot be negative");
  } else if (parseFloat(product.retailPrice) > parseFloat(product.mrp)) {
    errors.push("Retail Selling Price cannot be greater than MRP");
  }
  
  // Wholesale Selling Price: Required, non-negative, must be <= MRP and <= Retail Price
  if (isNaN(parseFloat(product.wholesalePrice))) {
    errors.push("Wholesale Selling Price is required");
  } else if (product.wholesalePrice < 0) {
    errors.push("Wholesale Selling Price cannot be negative");
  } else if (parseFloat(product.wholesalePrice) > parseFloat(product.mrp)) {
    errors.push("Wholesale Selling Price cannot be greater than MRP");
  } else if (parseFloat(product.wholesalePrice) > parseFloat(product.retailPrice)) {
    errors.push("Wholesale Selling Price cannot be greater than Retail Selling Price");
  }
  
  // Stock Quantity: Required, non-negative integer
  if (isNaN(parseInt(product.stockQty))) {
    errors.push("Stock Quantity is required");
  } else if (product.stockQty < 0) {
    errors.push("Stock Quantity cannot be negative");
  } else if (!Number.isInteger(parseFloat(product.stockQty))) {
    errors.push("Stock Quantity must be a whole number");
  }
  
  // Min Stock Alert at: Required, non-negative integer, must be <= Stock Quantity
  if (isNaN(parseInt(product.minStock))) {
    errors.push("Min Stock Alert at is required");
  } else if (product.minStock < 0) {
    errors.push("Min Stock Alert at cannot be negative");
  } else if (!Number.isInteger(parseFloat(product.minStock))) {
    errors.push("Min Stock Alert at must be a whole number");
  } else if (parseInt(product.minStock) > parseInt(product.stockQty)) {
    errors.push("Min Stock Alert cannot be greater than Stock Quantity");
  }
  
  // Optional fields with basic validation
  if (product.offerValue && product.offerValue.length > 50) {
    errors.push("Offer Value must be less than 50 characters");
  }
  
  if (product.rank && !Number.isInteger(parseFloat(product.rank))) {
    errors.push("Rank value for Sorting must be a whole number");
  }
  
  const MAX_PRICE = 999999999;
  const MAX_STOCK = 999999;

  if (parseFloat(product.purchasePrice) > MAX_PRICE) {
    errors.push("Purchase Price exceeds maximum allowed value");
  }
  if (parseInt(product.stockQty) > MAX_STOCK) {
    errors.push("Stock Quantity exceeds maximum allowed value");
  }
  
  return errors;
};
