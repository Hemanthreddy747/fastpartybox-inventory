import React, { useState } from "react";
import { Button, Modal, Form } from "react-bootstrap";
import { db } from "../firebase/firebase";
import {
  writeBatch,
  doc,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import imageCompression from "browser-image-compression";
import JSZip from "jszip";
import { toast } from "react-toastify";
import LoaderC from "../utills/loaderC";

const BatchUpload = ({ userUID, show, handleClose, fetchProducts }) => {
  const [batchUploadProgress, setBatchUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const sanitizeFileName = (fileName) => {
    // Return empty string if fileName is null or undefined
    if (!fileName) return '';
    
    // Ensure fileName is converted to string
    const str = String(fileName);
    
    return str
      .toLowerCase() // Convert to lowercase first
      .replace(/[^a-z0-9.]/g, '_') // Replace any non-alphanumeric chars (except dots) with underscore
      .replace(/_+/g, '_') // Replace multiple consecutive underscores with a single one
      .replace(/^_+|_+$/g, '') // Remove leading and trailing underscores
      .trim(); // Remove any whitespace
  };

  const handleBatchUpload = async (e) => {
    e.preventDefault();
    setLoading(true);
    setBatchUploadProgress(0);

    try {
      const excelFile = e.target.excelFile.files[0];
      const zipFile = e.target.zipFile.files[0];

      if (!excelFile || !zipFile) {
        toast.error("Please select both Excel and ZIP files.");
        return;
      }

      // Read Excel file
      const workbook = await readExcelFile(excelFile);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const products = XLSX.utils.sheet_to_json(worksheet);

      if (!products.length) {
        toast.error("Excel file is empty or has invalid format");
        return;
      }

      // Process ZIP file
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(zipFile);
      const imageFiles = {};

      // Create a map of product names for image matching
      const productNameMap = products.reduce((acc, product) => {
        // Check if product and Product Name exist
        if (product && product["Product Name"]) {
          try {
            const normalizedName = normalizeProductName(product["Product Name"]);
            const sanitizedName = sanitizeFileName(product["Product Name"]);
            
            acc[normalizedName] = product["Product Name"];
            acc[sanitizedName] = product["Product Name"];
          } catch (error) {
            console.warn(`Error processing product name: ${product["Product Name"]}`, error);
          }
        }
        return acc;
      }, {});

      // Add MIME type validation
      const isValidImageType = (filename) => {
        const validTypes = /\.(jpg|jpeg|png|gif)$/i;
        return validTypes.test(filename);
      };

      // Process all images from ZIP
      for (const [filename, file] of Object.entries(zipContents.files)) {
        if (!file.dir && isValidImageType(filename)) {
          try {
            // Get filename without path and extension
            const fileNameWithoutExt = String(filename
              .split('/')
              .pop()
              .replace(/\.[^/.]+$/, ''));

            // Create normalized versions of the filename with null checks
            const sanitizedFileName = sanitizeFileName(fileNameWithoutExt);
            const normalizedFileName = normalizeProductName(fileNameWithoutExt);

            // Find matching product with null checks
            const matchedProduct = products.find(product => {
              if (!product || !product["Product Name"]) return false;
              
              try {
                const productName = String(product["Product Name"]);
                const sanitizedProductName = sanitizeFileName(productName);
                const normalizedProductName = normalizeProductName(productName);
                
                return sanitizedFileName === sanitizedProductName || 
                       normalizedFileName === normalizedProductName;
              } catch (error) {
                console.warn(`Error matching product: ${product["Product Name"]}`, error);
                return false;
              }
            });

            if (matchedProduct) {
              const arrayBuffer = await file.async("arraybuffer");
              const blob = new Blob([arrayBuffer], {
                type: filename.toLowerCase().endsWith("png") ? "image/png" : "image/jpeg",
              });
              imageFiles[matchedProduct["Product Name"]] = blob;
            } else {
              console.warn(`No matching product found for image: ${filename}`);
              toast.warn(`No matching product found for image: ${filename}`);
            }
          } catch (error) {
            console.error(`Error processing image ${filename}:`, error);
            toast.error(`Error processing image ${filename}`);
          }
        }
      }

      // Delete all existing products and images first
      const batch1 = writeBatch(db);
      const batch2 = writeBatch(db);

      // Delete existing products
      const existingProductsSnapshot = await getDocs(
        collection(db, "users", userUID, "products")
      );
      existingProductsSnapshot.docs.forEach((doc) => {
        batch1.delete(doc.ref);
      });

      // Delete existing images
      const existingImagesSnapshot = await getDocs(
        collection(db, "users", userUID, "productImages")
      );
      existingImagesSnapshot.docs.forEach((doc) => {
        batch2.delete(doc.ref);
      });

      // Commit deletion batches
      await batch1.commit();
      await batch2.commit();

      // Process new products in batches
      let batchCount = 0;
      let currentBatch = writeBatch(db);
      const batchSize = 400;
      let successCount = 0;
      let imageCount = 0;

      for (let i = 0; i < products.length; i++) {
        const product = products[i];

        if (!product["Product Name"]) {
          toast.warn(`Skipping row ${i + 2}: Missing product name`);
          continue;
        }

        const productId = generateRandomCode(8);

        // Process image
        const imageFile = imageFiles[product["Product Name"]];
        let base64Image = null;

        if (imageFile) {
          try {
            const options = {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 800,
              useWebWorker: true,
            };

            // Create a File object from the Blob for compatibility
            const imageFileObj = new File([imageFile], "image.jpg", {
              type: imageFile.type || "image/jpeg",
            });

            const compressedFile = await imageCompression(
              imageFileObj,
              options
            );
            base64Image = await imageCompression.getDataUrlFromFile(
              compressedFile
            );
            imageCount++;
          } catch (error) {
            console.warn(
              `Image compression failed for ${product["Product Name"]}:`,
              error
            );
            toast.warn(`Failed to process image for: ${product["Product Name"]}`);
          }
        }

        // Prepare product data
        const newProduct = {
          productName: product["Product Name"],
          productDesc: product["Description"] || "",
          brand: product["Brand Name"] || "",
          retailPrice: parseFloat(product["Retail Selling Price"]) || 0,
          wholesalePrice: parseFloat(product["Wholesale Selling Price"]) || 0,
          stockQty: parseInt(product["Stock Quantity"]) || 0,
          minStock: parseInt(product["Min Stock Alert at"]) || 0,
          offerValue: product["Offer Value"] || "",
          category: product["Category"] || "",
          rank: product["Rank value for Sorting"] || "",
          purchasePrice: parseFloat(product["My Bulk Purchase Price"]) || 0,
          mrp: parseFloat(product["MRP"]) || 0,
          productId,
          archived: false,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        };

        // Add to batch
        const productRef = doc(db, "users", userUID, "products", productId);
        currentBatch.set(productRef, newProduct);

        if (base64Image) {
          const imageRef = doc(
            db,
            "users",
            userUID,
            "productImages",
            productId
          );
          currentBatch.set(imageRef, {
            productId,
            productImage: base64Image,
          });
        }

        batchCount++;
        successCount++;

        if (batchCount === batchSize) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchCount = 0;
        }

        setBatchUploadProgress(Math.round(((i + 1) / products.length) * 100));
      }

      // Commit remaining batch
      if (batchCount > 0) {
        await currentBatch.commit();
      }

      toast.success(
        `Upload completed: All existing data replaced. ${successCount} products processed, ${imageCount} images uploaded`
      );
      handleClose();
      await fetchProducts(userUID, false, true);
    } catch (error) {
      console.error("Batch upload error:", error);
      toast.error(`Error in batch upload: ${error.message}`);
    } finally {
      setLoading(false);
      setBatchUploadProgress(0);
    }
  };

  const handleDownloadProducts = async () => {
    setLoading(true);
    try {
      // Fetch products
      const productsSnapshot = await getDocs(
        collection(db, "users", userUID, "products")
      );

      // Fetch images
      const imagesSnapshot = await getDocs(
        collection(db, "users", userUID, "productImages")
      );

      // Create a map of productId to image data
      const imageMap = {};
      imagesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.productId && data.productImage) {
          imageMap[data.productId] = data.productImage;
        }
      });

      // Prepare products data for Excel
      const products = productsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          "Product Name": data.productName || "",
          "Description": data.productDesc || "",
          "Brand Name": data.brand || "",
          "Category": data.category || "",
          "My Bulk Purchase Price": data.purchasePrice || 0,
          "MRP": data.mrp || 0,
          "Retail Selling Price": data.retailPrice || 0,
          "Wholesale Selling Price": data.wholesalePrice || 0,
          "Stock Quantity": data.stockQty || 0,
          "Min Stock Alert at": data.minStock || 0,
          "Offer Value": data.offerValue || "",
          "Rank value for Sorting": data.rank || ""
        };
      });

      // Create Excel file
      const worksheet = XLSX.utils.json_to_sheet(products);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

      // Create ZIP file for images
      const zip = new JSZip();

      // Add images to ZIP using product names
      for (const doc of productsSnapshot.docs) {
        const productData = doc.data();
        const imageData = imageMap[productData.productId];

        if (imageData && productData.productName) {
          try {
            const sanitizedName = sanitizeFileName(productData.productName);
            // Convert base64 to blob
            const base64Response = await fetch(imageData);
            const imageBlob = await base64Response.blob();
            zip.file(`${sanitizedName}.png`, imageBlob);
          } catch (error) {
            console.warn(
              `Failed to process image for product: ${productData.productName}`,
              error
            );
            toast.warn(
              `Failed to process image for: ${productData.productName}`
            );
          }
        }
      }

      // Save Excel file
      XLSX.writeFile(workbook, "products.xlsx");

      // Generate and save ZIP file only if it contains files
      const zipFiles = Object.keys(zip.files);
      if (zipFiles.length > 0) {
        const zipContent = await zip.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(zipContent);
        const link = document.createElement("a");
        link.href = zipUrl;
        link.download = "product_images.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(zipUrl);
        toast.success("Products and images downloaded successfully");
      } else {
        toast.warn("No images found to download");
        toast.success("Products Excel file downloaded successfully");
      }
    } catch (error) {
      console.error("Download error:", error);
      toast.error(`Error downloading products: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const readExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        resolve(workbook);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const generateRandomCode = (length) => {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");
  };

  const generateTemplateWorkbook = () => {
    const headers = [
      "Product Name",
      "Description",
      "Brand Name",
      "Category",
      "My Bulk Purchase Price",
      "MRP",
      "Retail Selling Price",
      "Wholesale Selling Price",
      "Stock Quantity",
      "Min Stock Alert at",
      "Offer Value",
      "Rank value for Sorting"
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products Template");
    return workbook;
  };

  const validateExcelData = (products) => {
    const errors = [];
    const duplicateNames = new Set();
    const requiredFields = [
      "Product Name",
      "Retail Selling Price",
      "Wholesale Selling Price",
      "Stock Quantity"
    ];

    products.forEach((product, index) => {
      const rowNum = index + 2; // Excel rows start at 1, and we have headers

      // Check required fields
      requiredFields.forEach(field => {
        if (!product[field]) {
          errors.push(`Row ${rowNum}: Missing ${field}`);
        }
      });

      // Check for duplicate product names
      if (product["Product Name"]) {
        const normalizedName = product["Product Name"].toLowerCase().trim();
        if (duplicateNames.has(normalizedName)) {
          errors.push(`Row ${rowNum}: Duplicate product name "${product["Product Name"]}"`);
        }
        duplicateNames.add(normalizedName);
      }

      // Validate numeric fields
      const numericFields = {
        "Retail Selling Price": 0,
        "Wholesale Selling Price": 0,
        "Stock Quantity": 0,
        "Min Stock Alert at": 0,
        "MRP": 0,
        "My Bulk Purchase Price": 0
      };

      Object.entries(numericFields).forEach(([field, minValue]) => {
        if (product[field] && (isNaN(parseFloat(product[field])) || parseFloat(product[field]) < minValue)) {
          errors.push(`Row ${rowNum}: Invalid ${field}`);
        }
      });

      // Business logic validations
      if (parseFloat(product["Wholesale Selling Price"]) > parseFloat(product["MRP"])) {
        errors.push(`Row ${rowNum}: Wholesale price cannot be greater than MRP`);
      }
    });

    return errors;
  };

  const normalizeProductName = (name) => {
    // Return empty string if name is null or undefined
    if (!name) return '';
    
    // Ensure name is converted to string before using toLowerCase
    return String(name).toLowerCase().trim();
  };

  return (
    <>
      {loading && <LoaderC />}
      <div className="batch-upload-container">
        <Modal show={show} onHide={handleClose}>
          <Modal.Header closeButton>
            <Modal.Title>Batch Upload Products</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleBatchUpload}>
              <Form.Group className="mb-3">
                <Form.Label>Excel File</Form.Label>
                <Form.Control
                  type="file"
                  name="excelFile"
                  accept=".xlsx,.xls"
                  required
                />
                <Form.Text className="text-muted">
                  Upload Excel file containing product details
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Images ZIP File</Form.Label>
                <Form.Control type="file" name="zipFile" accept=".zip" required />
                <Form.Text className="text-muted">
                  Upload ZIP file containing product images named exactly as product
                  names
                </Form.Text>
              </Form.Group>

              {batchUploadProgress > 0 && (
                <div className="mb-3">
                  <div className="progress">
                    <div
                      className="progress-bar"
                      role="progressbar"
                      style={{ width: `${batchUploadProgress}%` }}
                      aria-valuenow={batchUploadProgress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      {batchUploadProgress}%
                    </div>
                  </div>
                </div>
              )}

              <div className="d-flex justify-content-between">
                <Button
                  variant="secondary"
                  onClick={handleDownloadProducts}
                  disabled={loading}
                >
                  {loading ? "Downloading..." : "Download Template"}
                </Button>
                <Button variant="primary" type="submit" disabled={loading}>
                  {loading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </Form>
          </Modal.Body>
        </Modal>
      </div>
    </>
  );
};

export default BatchUpload;
