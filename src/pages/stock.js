import React, { useState, useEffect, useCallback } from "react";
import { Button, Modal, Form, Row, Col } from "react-bootstrap";
import { db } from "../firebase/firebase";
import { ToastContainer, toast } from "react-toastify";
import FormLabel from "../components/FormLabel";
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  limit,
  startAfter,
  updateDoc, // Add this
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import imageCompression from "browser-image-compression";
import "./stock.css";
import LoaderC from "../utills/loaderC";
import BatchUpload from "./batchUpload";
import SEO from "../components/SEO";
import { storageUtils } from "../utils/storageUtils";
import { SubscriptionService } from "../services/subscriptionService";

const Stock = () => {
  // ============= STATE MANAGEMENT =============
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userUID, setUserUID] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [currentProductId, setCurrentProductId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("");
  const [formData, setFormData] = useState({
    productName: "",
    productDesc: "",
    brand: "",
    category: "",
    purchasePrice: "",
    mrp: "",
    retailPrice: "",
    wholesalePrice: "",
    stockQty: "",
    minStock: "",
    offerValue: "",
    rank: "",
    archived: false,
    productImage: null,
  });

  // Add this to determine if we're in edit mode
  const isEdit = Boolean(currentProductId);

  // ============= NOTIFICATION HELPERS =============
  const notifyError = (message) => toast.error(message);
  const notifySuccess = (message) => toast.success(message);

  // ============= AUTH AND INITIAL LOAD =============
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserUID(user.uid);
        fetchProducts(user.uid);
      }
    });

    return () => unsubscribe();
  }, []);

  // ============= DATA FETCHING =============
  const fetchProducts = async (uid, loadMore = false, forceRefresh = false) => {
    if (!uid) return;
    setLoading(true);

    try {
      const productsRef = collection(db, "users", uid, "products");
      // Add where clause to filter out archived products if needed
      const q = query(productsRef, limit(50));
      const querySnapshot = await getDocs(q);
      let productsList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Clear image cache if it's a force refresh
      if (forceRefresh) {
        localStorage.removeItem("productImages");
      }

      // Batch fetch images for better performance
      const imagesRef = collection(db, "users", uid, "productImages");
      const imagesSnapshot = await getDocs(imagesRef);
      const imageMap = {};

      // Create a map of productId to image data
      imagesSnapshot.docs.forEach((doc) => {
        const imageData = doc.data();
        if (imageData.productId && imageData.productImage) {
          imageMap[imageData.productId] = imageData.productImage;
        }
      });

      // Update local cache with new image data
      localStorage.setItem("productImages", JSON.stringify(imageMap));

      // Attach images to products
      productsList = productsList.map((product) => ({
        ...product,
        productImage: product.productId ? imageMap[product.productId] : null,
      }));

      // Update state based on loadMore and forceRefresh flags
      setProducts((prev) =>
        loadMore && !forceRefresh ? [...prev, ...productsList] : productsList
      );
    } catch (error) {
      console.error("Fetch products error:", error);
      notifyError("Error fetching products");
    } finally {
      setLoading(false);
    }
  };

  // ============= PRODUCT OPERATIONS =============
  const prepareProductData = (data, productId) => {
    return {
      productName: data.productName,
      productDesc: data.productDesc || "",
      brand: data.brand || "",
      category: data.category || "",
      purchasePrice: parseFloat(data.purchasePrice) || 0,
      mrp: parseFloat(data.mrp) || 0,
      retailPrice: parseFloat(data.retailPrice) || 0,
      wholesalePrice: parseFloat(data.wholesalePrice) || 0,
      stockQty: parseInt(data.stockQty) || 0,
      minStock: parseInt(data.minStock) || 0,
      offerValue: data.offerValue || "",
      rank: data.rank || "",
      productId,
      archived: false,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID) return;

      const canAddProduct = await SubscriptionService.checkLimit(
        userUID,
        "products"
      );
      if (!canAddProduct) {
        toast.error(
          "You've reached your product limit. Please upgrade your subscription."
        );
        return;
      }

      const productId = generateRandomCode(8);
      const newProduct = prepareProductData(formData, productId);

      const batch = writeBatch(db);

      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(
        formData.productImage,
        options
      );
      const base64Image = await imageCompression.getDataUrlFromFile(
        compressedFile
      );

      const productRef = doc(collection(db, "users", userUID, "products"));
      const imageRef = doc(db, "users", userUID, "productImages", productId);

      batch.set(productRef, newProduct);
      batch.set(imageRef, {
        productId,
        productImage: base64Image,
      });

      await batch.commit();

      // Update local cache
      const cachedImages = JSON.parse(
        localStorage.getItem("productImages") || "{}"
      );
      cachedImages[productId] = [
        {
          productId,
          productImage: base64Image,
        },
      ];
      localStorage.setItem("productImages", JSON.stringify(cachedImages));

      notifySuccess("Product added successfully");
      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error adding product");
    } finally {
      setLoading(false);
    }
  };

  const handleEditProduct = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID) return;

      // Create a copy of formData and handle empty numeric fields
      let updatedData = { ...formData };

      // Define required numeric fields
      const requiredNumericFields = [
        "purchasePrice",
        "mrp",
        "retailPrice",
        "wholesalePrice",
        "stockQty",
        "minStock",
      ];

      // Set empty numeric fields to 0
      requiredNumericFields.forEach((field) => {
        if (!updatedData[field] || updatedData[field] === "") {
          updatedData[field] = "0";
        }
      });

      // Remove productImage from update data
      delete updatedData.productImage;

      // Remove truly empty fields (non-numeric optional fields)
      Object.keys(updatedData).forEach((key) => {
        if (updatedData[key] === undefined || updatedData[key] === "") {
          delete updatedData[key];
        }
      });

      updatedData.updatedAt = serverTimestamp();

      const productRef = doc(
        db,
        "users",
        userUID,
        "products",
        currentProductId
      );

      const batch = writeBatch(db);
      batch.set(productRef, updatedData, { merge: true });

      if (formData.productImage && typeof formData.productImage !== "string") {
        const options = {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 800,
          useWebWorker: true,
        };

        const compressedFile = await imageCompression(
          formData.productImage,
          options
        );
        const base64Image = await imageCompression.getDataUrlFromFile(
          compressedFile
        );

        const imageRef = doc(
          db,
          "users",
          userUID,
          "productImages",
          updatedData.productId
        );
        batch.set(imageRef, {
          productId: updatedData.productId,
          productImage: base64Image,
        });

        // Update local cache
        const cachedImages = JSON.parse(
          localStorage.getItem("productImages") || "{}"
        );
        cachedImages[updatedData.productId] = [
          {
            productId: updatedData.productId,
            productImage: base64Image,
          },
        ];
        localStorage.setItem("productImages", JSON.stringify(cachedImages));
      }

      await batch.commit();
      notifySuccess("Product updated successfully");
      await fetchProducts(userUID);
      setShowEditModal(false);
    } catch (error) {
      console.error("Edit product error:", error);
      notifyError("Error updating product");
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveProduct = async () => {
    if (!userUID || !currentProductId) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const productRef = doc(
        db,
        "users",
        userUID,
        "products",
        currentProductId
      );

      batch.update(productRef, {
        archived: !formData.archived,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      notifySuccess(
        `Product ${formData.archived ? "unarchived" : "archived"} successfully`
      );
      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error archiving product");
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!userUID || !currentProductId) return;

    if (
      window.confirm(
        "Are you sure you want to permanently delete this product? This action cannot be undone."
      )
    ) {
      setLoading(true);
      try {
        const batch = writeBatch(db);

        const productRef = doc(
          db,
          "users",
          userUID,
          "products",
          currentProductId
        );
        batch.delete(productRef);

        if (formData.productId) {
          const imageRef = doc(
            db,
            "users",
            userUID,
            "productImages",
            formData.productId
          );
          batch.delete(imageRef);

          // Update local cache
          const cachedImages = JSON.parse(
            localStorage.getItem("productImages") || "{}"
          );
          delete cachedImages[formData.productId];
          localStorage.setItem("productImages", JSON.stringify(cachedImages));
        }

        await batch.commit();
        notifySuccess("Product deleted successfully");
        resetForm();
        await fetchProducts(userUID);
      } catch (error) {
        notifyError("Error deleting product");
      } finally {
        setLoading(false);
      }
    }
  };

  // ============= FORM HANDLING =============
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "stockQty") {
      // Convert to number and check constraints
      let numValue = parseInt(value) || 0;

      // Enforce limits
      if (numValue < 0) numValue = 0;
      if (numValue > 10000000) numValue = 10000000;

      setFormData((prev) => ({
        ...prev,
        [name]: numValue.toString(),
      }));
      return;
    }

    // Handle other fields normally
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddNewClick = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (product) => {
    setCurrentProductId(product.id);
    setFormData({
      ...product,
      productImage: product.productImage,
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      productName: "",
      productDesc: "",
      brand: "",
      category: "",
      purchasePrice: "",
      mrp: "",
      retailPrice: "",
      wholesalePrice: "",
      offerValue: "",
      minStock: "",
      rank: "",
      stockQty: "",
      archived: false,
      productImage: null,
    });
    setShowAddModal(false);
    setShowEditModal(false);
  };

  // ============= UTILITY FUNCTIONS =============
  const generateRandomCode = (length) => {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");
  };

  const validateForm = (data) => {
    const errors = [];

    if (!data.productName?.trim()) errors.push("Product Name is required");
    if (
      isNaN(parseFloat(data.purchasePrice)) ||
      parseFloat(data.purchasePrice) < 0
    )
      errors.push("Invalid Bulk Purchase Price");
    if (isNaN(parseFloat(data.mrp)) || parseFloat(data.mrp) < 0)
      errors.push("Invalid MRP");
    if (isNaN(parseFloat(data.retailPrice)) || parseFloat(data.retailPrice) < 0)
      errors.push("Invalid Retail Selling Price");
    if (
      isNaN(parseFloat(data.wholesalePrice)) ||
      parseFloat(data.wholesalePrice) < 0
    )
      errors.push("Invalid Wholesale Selling Price");
    if (parseFloat(data.wholesalePrice) > parseFloat(data.mrp))
      errors.push("Wholesale price cannot be greater than MRP");
    if (isNaN(parseInt(data.stockQty)) || parseInt(data.stockQty) < 0)
      errors.push("Invalid Stock Quantity");
    if (isNaN(parseInt(data.minStock)) || parseInt(data.minStock) < 0)
      errors.push("Invalid Min Stock Alert value");

    // Stock Quantity validation
    const stockQty = parseInt(data.stockQty) || 0;
    if (isNaN(stockQty)) {
      errors.push("Stock Quantity must be a number");
    } else if (stockQty < 0) {
      errors.push("Stock Quantity cannot be negative");
    } else if (stockQty > 10000000) {
      errors.push("Stock Quantity cannot exceed 10,000,000");
    } else if (!Number.isInteger(stockQty)) {
      errors.push("Stock Quantity must be a whole number");
    }

    return errors;
  };

  // ============= COMPUTED PROPERTIES =============
  const activeProducts = products.filter((product) => !product.archived);
  const archivedProducts = products.filter((product) => product.archived);

  // Add these functions to your Stock component
  const handleQuickUpdate = (amount) => {
    const currentQty = parseInt(formData.stockQty) || 0;
    const newQty = Math.min(10000000, Math.max(0, currentQty + amount));
    setFormData({
      ...formData,
      stockQty: newQty.toString(),
    });
  };

  const handleQuickStockUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID || !currentProductId) return;

      const updateData = {
        stockQty: parseInt(formData.stockQty),
        updatedAt: new Date().toISOString(),
      };

      // Store update in local storage if offline
      if (!navigator.onLine) {
        const pendingUpdates = JSON.parse(
          localStorage.getItem("pendingProductUpdates") || "[]"
        );
        pendingUpdates.push({
          productId: currentProductId,
          data: updateData,
          timestamp: Date.now(),
        });
        localStorage.setItem(
          "pendingProductUpdates",
          JSON.stringify(pendingUpdates)
        );
        toast.info("Update stored offline. Will sync when online");
        return;
      }

      const productRef = doc(
        db,
        "users",
        userUID,
        "products",
        currentProductId
      );
      await updateDoc(productRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });

      notifySuccess("Stock quantity updated successfully");
      await fetchProducts(userUID);
      setShowEditModal(false);
    } catch (error) {
      notifyError("Error updating stock quantity");
    } finally {
      setLoading(false);
    }
  };

  const formFields = {
    productName: {
      label: "Product Name ", // Added star
      type: "text",
      required: true,
      maxLength: 100,
    },
    productDesc: {
      label: "Description",
      type: "text",
      required: false,
    },
    brand: {
      label: "Brand Name",
      type: "text",
      required: false,
    },
    category: {
      label: "Category",
      type: "text",
      required: false,
    },
    purchasePrice: {
      label: "My Bulk Purchase Price ", // Added star
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
    },
    mrp: {
      label: "MRP ", // Added star
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
    },
    retailPrice: {
      label: "Retail Selling Price ", // Added star
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
    },
    wholesalePrice: {
      label: "Wholesale Selling Price ", // Added star
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
    },
    stockQty: {
      label: "Stock Quantity ", // Added star
      type: "number",
      required: true,
      min: 0,
      step: "1",
    },
    minStock: {
      label: "Min Stock Alert at ", // Added star
      type: "number",
      required: true,
      min: 0,
      step: "1",
    },
    offerValue: {
      label: "Offer Value",
      type: "text",
      required: false,
      maxLength: 50,
    },
    rank: {
      label: "Rank value for Sorting",
      type: "number",
      required: false,
      step: "1",
    },
  };

  return (
    <>
      {loading && <LoaderC />}
      <div>
        <ToastContainer
          position="bottom-left"
          autoClose={3000}
          limit={3}
          theme="colored"
        />
        {/* Search and Add New Section */}
        <div className="d-flex justify-content-between mb-2 mt-2 ms-1 me-1 gap-1">
          <input
            type="text"
            placeholder="Search by name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control w-50"
          />
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="form-control w-25"
          >
            <option value="">Sort By</option>
            <option value="name">Product Name</option>
            <option value="stockQty">Stock Quantity</option>
          </select>
          <Button variant="primary" onClick={handleAddNewClick}>
            Add New
          </Button>
        </div>
        {/* Add Product Modal */}
        <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>{isEdit ? "Edit Product" : "Add Product"}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={isEdit ? handleEditProduct : handleAddProduct}>
              <Row>
                {Object.entries(formFields).map(([key, field]) => (
                  <Col xs={6} key={key} className="mt-3">
                    <Form.Group controlId={`form${key}`}>
                      <FormLabel required={field.required}>
                        {field.label}
                      </FormLabel>
                      <Form.Control
                        type={field.type}
                        name={key}
                        value={formData[key]}
                        onChange={handleInputChange}
                        required={field.required}
                        min={field.min}
                        step={field.step}
                        maxLength={field.maxLength}
                      />
                    </Form.Group>
                  </Col>
                ))}

                {/* Product Image Field */}
                <Col xs={12} className="mt-3">
                  <Form.Group controlId="formProductImage">
                    <Form.Label>Product Image</Form.Label>
                    <Form.Control
                      type="file"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          productImage: e.target.files[0],
                        })
                      }
                      accept="image/*"
                      required={!isEdit}
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Button variant="primary" type="submit" className="mt-3">
                {isEdit ? "Update Product" : "Add Product"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAddModal(false);
                  setShowBatchUploadModal(true);
                }}
                className="ms-2 mt-3"
              >
                Batch Upload
              </Button>
            </Form>
          </Modal.Body>
        </Modal>
        {/* Batch Upload Modal */}
        <BatchUpload
          userUID={userUID}
          show={showBatchUploadModal}
          handleClose={() => setShowBatchUploadModal(false)}
          fetchProducts={(uid, loadMore = false, forceRefresh = false) =>
            fetchProducts(uid, loadMore, forceRefresh)
          }
        />

        {/* Edit Product Modal */}
        <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Update - ( {formData.productName} )</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleEditProduct}>
              {/* Stock Update Section */}
              <div className="stock-update-section">
                <Row>
                  <Col xs={12}>
                    <Form.Group controlId="formStockQty">
                      <Form.Label className="stock-qty-label">
                        Current Stock Quantity
                      </Form.Label>
                      <Form.Control
                        type="number"
                        name="stockQty"
                        value={formData.stockQty || "0"}
                        onChange={handleInputChange}
                        className="stock-qty-input"
                        required
                        min="0"
                        max="10000000"
                        autoFocus
                      />
                    </Form.Group>

                    <div className="quick-update-buttons">
                      <button
                        type="button"
                        className="quick-update-btn"
                        onClick={() => handleQuickUpdate(1)}
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        className="quick-update-btn"
                        onClick={() => handleQuickUpdate(5)}
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        className="quick-update-btn"
                        onClick={() => handleQuickUpdate(10)}
                      >
                        +10
                      </button>
                      <button
                        type="button"
                        className="quick-update-btn"
                        onClick={() => handleQuickUpdate(-1)}
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        className="quick-update-btn"
                        onClick={() => handleQuickUpdate(-5)}
                      >
                        -5
                      </button>
                    </div>

                    <div className="stock-update-actions">
                      <Button
                        variant="primary"
                        className="update-stock-btn"
                        onClick={handleQuickStockUpdate}
                      >
                        Update Stock
                      </Button>
                    </div>
                  </Col>
                </Row>
              </div>

              {/* Other Fields Section */}
              <div className="form-section-divider"></div>
              <div className="other-fields-section">
                <Row className="gy-3">
                  {/* Your existing form fields */}
                  <Col xs={6}>
                    <Form.Group controlId="formProductName">
                      <Form.Label>Product Name *</Form.Label>
                      <Form.Control
                        type="text"
                        name="productName"
                        value={formData.productName || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formProductDesc">
                      <Form.Label>Description</Form.Label>
                      <Form.Control
                        type="text"
                        name="productDesc"
                        value={formData.productDesc || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formBrand">
                      <Form.Label>Brand Name</Form.Label>
                      <Form.Control
                        type="text"
                        name="brand"
                        value={formData.brand || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formCategory">
                      <Form.Label>Category</Form.Label>
                      <Form.Control
                        type="text"
                        name="category"
                        value={formData.category || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <hr className="mb-0 pb-0"></hr>
                  <Col xs={6}>
                    <Form.Group controlId="formPurchasePrice">
                      <Form.Label>My Bulk Purchase Price</Form.Label>
                      <Form.Control
                        type="number"
                        name="purchasePrice"
                        value={formData.purchasePrice || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formMrp">
                      <Form.Label>MRP</Form.Label>
                      <Form.Control
                        type="number"
                        name="mrp"
                        value={formData.mrp || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  {/* <Col xs={6}>
                    <Form.Group controlId="formBulkPrice">
                      <Form.Label>BulkPrice</Form.Label>
                      <Form.Control
                        type="number"
                        name="bulkPrice"
                        value={formData.bulkPrice || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col> */}
                  <Col xs={6}>
                    <Form.Group controlId="formRetailPrice">
                      <Form.Label>Retail Selling Price</Form.Label>
                      <Form.Control
                        type="number"
                        name="retailPrice"
                        value={formData.retailPrice || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formWholesalePrice">
                      <Form.Label>Wholesale Selling Price</Form.Label>
                      <Form.Control
                        type="number"
                        name="wholesalePrice"
                        value={formData.wholesalePrice || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <hr className="mb-0 pb-0"></hr>
                  <Col xs={6}>
                    <Form.Group controlId="formOfferValue">
                      <Form.Label>Offer Value</Form.Label>
                      <Form.Control
                        type="text"
                        name="offerValue"
                        value={formData.offerValue || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formMinStock">
                      <Form.Label>Min Stock Alert at</Form.Label>
                      <Form.Control
                        type="number"
                        name="minStock"
                        value={formData.minStock || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={6}>
                    <Form.Group controlId="formRank">
                      <Form.Label>Rank value for Sorting</Form.Label>
                      <Form.Control
                        type="text"
                        name="rank"
                        value={formData.rank || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={9}>
                    <Form.Group controlId="formProductImage">
                      <Form.Label>Product Image</Form.Label>

                      <Form.Control
                        type="file"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            productImage: e.target.files[0],
                          })
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={3}>
                    <Form.Group controlId="formProductImage">
                      {formData.productImage &&
                        typeof formData.productImage === "string" && (
                          <div className="mt-2">
                            <img
                              src={formData.productImage}
                              alt="Current product"
                              style={{ maxWidth: "50px", height: "auto" }}
                            />
                          </div>
                        )}
                    </Form.Group>
                  </Col>
                </Row>

                <Button variant="primary" type="submit" className="mt-3">
                  Update All Details
                </Button>
                <Button
                  variant="warning"
                  type="button"
                  onClick={handleArchiveProduct}
                  className="ms-4 me-4 mt-3"
                >
                  {formData.archived ? "Unarchive" : "Archive"}
                </Button>
                <Button
                  variant="danger"
                  type="button"
                  onClick={handlePermanentDelete}
                  className="me-2 mt-3"
                >
                  Delete
                </Button>
              </div>
            </Form>
          </Modal.Body>
        </Modal>
        {/* Active Products Grid */}
        <div className="product-flex-container m-1">
          {activeProducts.length > 0 ? (
            activeProducts.map((product) => (
              <div
                className="product-card"
                key={product.id}
                style={{ backgroundImage: `url(${product.productImage})` }}
                onClick={() => openEditModal(product)}
              >
                <div className="details">
                  <div className="p-2">
                    <p>
                      <span>{product.productName}</span>
                    </p>
                    <p>
                      Qty: <span>{product.stockQty}</span>
                    </p>

                    <p className="">MRP: {product.mrp}</p>
                    <p>Bulk Price: {product.wholesalePrice}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div
              className="product-card"
              style={{
                backgroundImage: `url('https://img.freepik.com/free-photo/vertical-banners-sales_23-2150629840.jpg')`,
              }}
            >
              <div className="details">
                <div className="p-2">
                  <p>
                    Qty: <span>99</span>
                  </p>
                  <p>
                    <span>Sample Product name</span>
                  </p>
                  <p className="mt-4">MRP: 9.99</p>
                  <p>Bulk Price: 9.99</p>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Archived Products Grid */}
        {archivedProducts.length > 0 && (
          <div className="product-flex-container m-1">
            {archivedProducts.map((product) => (
              <div
                className="product-card archived"
                key={product.id}
                style={{ backgroundImage: `url(${product.productImage})` }}
                onClick={() => openEditModal(product)}
              >
                <div className="details">
                  <div className="p-2">
                    <div className="archived-badge">Archived</div>
                    <p>
                      QTY: <span>{product.stockQty}</span>
                    </p>
                    <p>
                      <span>{product.productName}</span>
                    </p>
                    <p className="mt-4">MRP: {product.mrp}</p>
                    <p>Wholesale Price: {product.wholesalePrice}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Styles */}
      </div>
    </>
  );
};

export default Stock;
