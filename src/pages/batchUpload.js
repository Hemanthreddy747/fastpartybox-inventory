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

const BatchUpload = ({ userUID, show, handleClose, fetchProducts }) => {
  const [batchUploadProgress, setBatchUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const sanitizeFileName = (fileName) => {
    return fileName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .trim();
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
        if (product.productName) {
          const sanitized = sanitizeFileName(product.productName);
          acc[sanitized] = product.productName;
          acc[product.productName.toLowerCase()] = product.productName;
        }
        return acc;
      }, {});

      // Process all images from ZIP
      for (const [filename, file] of Object.entries(zipContents.files)) {
        if (!file.dir && file.name.match(/\.(jpg|jpeg|png)$/i)) {
          const fileNameWithoutExt = filename
            .split("/")
            .pop()
            .replace(/\.[^/.]+$/, "");

          const sanitizedName = sanitizeFileName(fileNameWithoutExt);
          const lowerName = fileNameWithoutExt.toLowerCase();

          const matchedProductName =
            productNameMap[sanitizedName] ||
            productNameMap[lowerName] ||
            productNameMap[fileNameWithoutExt];

          if (matchedProductName) {
            try {
              // Get array buffer instead of blob
              const arrayBuffer = await file.async("arraybuffer");
              // Convert array buffer to blob with proper MIME type
              const blob = new Blob([arrayBuffer], {
                type: filename.toLowerCase().endsWith("png")
                  ? "image/png"
                  : "image/jpeg",
              });
              imageFiles[matchedProductName] = blob;
            } catch (error) {
              console.warn(`Failed to process ZIP image ${filename}:`, error);
            }
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

        if (!product.productName) {
          toast.warn(`Skipping row ${i + 2}: Missing product name`);
          continue;
        }

        const productId = generateRandomCode(8);

        // Process image
        const imageFile = imageFiles[product.productName];
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
              `Image compression failed for ${product.productName}:`,
              error
            );
            toast.warn(`Failed to process image for: ${product.productName}`);
          }
        }

        // Prepare product data
        const newProduct = {
          productName: product.productName,
          productDesc: product.productDesc || "",
          brand: product.brand || "",
          bulkPrice: parseFloat(product.bulkPrice) || 0,
          retailPrice: parseFloat(product.retailPrice) || 0,
          wholesalePrice: parseFloat(product.wholesalePrice) || 0,
          stockQty: parseInt(product.stockQty) || 0,
          minStock: parseInt(product.minStock) || 0,
          offerValue: product.offerValue || "",
          category: product.category || "",
          rank: product.rank || "",
          purchasePrice: parseFloat(product.purchasePrice) || 0,
          mrp: parseFloat(product.mrp) || 0,
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
          productName: data.productName || "",
          productDesc: data.productDesc || "",
          brand: data.brand || "",
          category: data.category || "",
          bulkPrice: data.bulkPrice || 0,
          retailPrice: data.retailPrice || 0,
          wholesalePrice: data.wholesalePrice || 0,
          stockQty: data.stockQty || 0,
          minStock: data.minStock || 0,
          offerValue: data.offerValue || "",
          rank: data.rank || "",
          purchasePrice: data.purchasePrice || 0,
          mrp: data.mrp || 0,
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

  return (
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
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Uploading..." : "Upload"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownloadProducts}
              disabled={loading}
            >
              Download Template
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
};

export default BatchUpload;
