const columns = [
  { field: 'productName', headerName: 'Product Name', width: 200 },
  { field: 'productDesc', headerName: 'Description', width: 200 },
  { field: 'brand', headerName: 'Brand Name', width: 130 },
  { field: 'category', headerName: 'Category', width: 130 },
  { field: 'purchasePrice', headerName: 'My Bulk Purchase Price', width: 150, 
    valueFormatter: (params) => `₹${params.value.toFixed(2)}` },
  { field: 'mrp', headerName: 'MRP', width: 130,
    valueFormatter: (params) => `₹${params.value.toFixed(2)}` },
  { field: 'retailPrice', headerName: 'Retail Selling Price', width: 150,
    valueFormatter: (params) => `₹${params.value.toFixed(2)}` },
  { field: 'wholesalePrice', headerName: 'Wholesale Selling Price', width: 150,
    valueFormatter: (params) => `₹${params.value.toFixed(2)}` },
  { field: 'stockQty', headerName: 'Stock Quantity', width: 130 },
  { field: 'minStock', headerName: 'Min Stock Alert at', width: 150 },
  { field: 'offerValue', headerName: 'Offer Value', width: 130 },
  { field: 'rank', headerName: 'Rank value for Sorting', width: 150 }
];
