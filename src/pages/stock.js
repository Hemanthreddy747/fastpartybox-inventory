import React, { useState, useEffect, useCallback } from "react";
import { Button, Modal, Form, Row, Col } from "react-bootstrap";
import { db } from "../firebase/firebase";
import { ToastContainer, toast } from "react-toastify";
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
    bulkPrice: "",
    retailPrice: "",
    wholesalePrice: "",
    stockQty: "",
    minStock: "",
    offerValue: "",
    rank: "",
    purchasePrice: "",
    mrp: "",
    archived: false,
    productImage: null,
  });

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
  const handleAddProduct = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID) return;

      // Check subscription limits before adding
      const canAddProduct = await SubscriptionService.checkLimit(userUID, 'products');
      if (!canAddProduct) {
        toast.error("You've reached your product limit. Please upgrade your subscription.");
        return;
      }

      const batch = writeBatch(db);
      const productId = generateRandomCode(8);

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

      const newProduct = {
        ...formData,
        productId,
        archived: false,
        createdAt: serverTimestamp(),
      };
      delete newProduct.productImage;

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
      const validationErrors = validateForm(formData);
      if (validationErrors.length > 0) {
        validationErrors.forEach(error => toast.error(error));
        return;
      }

      if (!userUID) return;

      const batch = writeBatch(db);
      let updatedData = { ...formData };
      delete updatedData.productImage;

      // Remove empty fields
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
      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
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
    setFormData({ ...formData, [name]: value });
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
      bulkPrice: "",
      retailPrice: "",
      wholesalePrice: "",
      stockQty: "",
      minStock: "",
      offerValue: "",
      rank: "",
      purchasePrice: "",
      mrp: "",
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
    
    if (!data.productName?.trim()) errors.push("Product name is required");
    if (isNaN(data.stockQty) || data.stockQty < 0) errors.push("Invalid stock quantity");
    if (isNaN(data.mrp) || data.mrp < 0) errors.push("Invalid MRP");
    if (isNaN(data.wholesalePrice) || data.wholesalePrice < 0) errors.push("Invalid wholesale price");
    if (data.wholesalePrice > data.mrp) errors.push("Wholesale price cannot be greater than MRP");
    
    return errors;
  };

  // ============= COMPUTED PROPERTIES =============
  const activeProducts = products.filter((product) => !product.archived);
  const archivedProducts = products.filter((product) => product.archived);

  // Add these functions to your Stock component
  const handleQuickUpdate = (amount) => {
    const currentQty = parseInt(formData.stockQty) || 0;
    const newQty = Math.max(0, currentQty + amount);
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
        const pendingUpdates = JSON.parse(localStorage.getItem('pendingProductUpdates') || '[]');
        pendingUpdates.push({
          productId: currentProductId,
          data: updateData,
          timestamp: Date.now()
        });
        localStorage.setItem('pendingProductUpdates', JSON.stringify(pendingUpdates));
        toast.info("Update stored offline. Will sync when online");
        return;
      }

      const productRef = doc(db, "users", userUID, "products", currentProductId);
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

  return (
    <>
      {loading && <LoaderC />}
      <div>
        <ToastContainer />
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
            <Modal.Title>Add Product</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleAddProduct}>
              <Row>
                {Object.keys(formData).map((key) =>
                  key !== "productImage" && key !== "archived" ? (
                    <Col xs={6} key={key}>
                      <Form.Group controlId={`form${key}`}>
                        <Form.Label>
                          {key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase())}
                        </Form.Label>
                        <Form.Control
                          type={
                            key.includes("Price") || key.includes("Qty")
                              ? "number"
                              : "text"
                          }
                          name={key}
                          value={formData[key]}
                          onChange={handleInputChange}
                          required
                        />
                      </Form.Group>
                    </Col>
                  ) : key === "productImage" ? (
                    <Col xs={12} key={key}>
                      <Form.Group controlId={`form${key}`}>
                        <Form.Label>Product Image</Form.Label>
                        <Form.Control
                          type="file"
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              productImage: e.target.files[0],
                            })
                          }
                          required
                        />
                      </Form.Group>
                    </Col>
                  ) : null
                )}
              </Row>
              <Button variant="primary" type="submit" className="mt-3">
                Add Product
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
            <Modal.Title>Update Stock - {formData.productName}</Modal.Title>
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
                        value={formData.stockQty || ""}
                        onChange={handleInputChange}
                        className="stock-qty-input"
                        required
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
                <Row>
                  {/* Your existing form fields */}
                  <Col xs={6}>
                    <Form.Group controlId="formProductName">
                      <Form.Label>Product Name</Form.Label>
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
                      <Form.Label>Product Desc</Form.Label>
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
                      <Form.Label>Brand</Form.Label>
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
                  <Col xs={6}>
                    <Form.Group controlId="formBulkPrice">
                      <Form.Label>Bulk Price</Form.Label>
                      <Form.Control
                        type="number"
                        name="bulkPrice"
                        value={formData.bulkPrice || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formRetailPrice">
                      <Form.Label>Retail Price</Form.Label>
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
                      <Form.Label>Wholesale Price</Form.Label>
                      <Form.Control
                        type="number"
                        name="wholesalePrice"
                        value={formData.wholesalePrice || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formMinStock">
                      <Form.Label>Min Stock</Form.Label>
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
                    <Form.Group controlId="formRank">
                      <Form.Label>Rank</Form.Label>
                      <Form.Control
                        type="text"
                        name="rank"
                        value={formData.rank || ""}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group controlId="formPurchasePrice">
                      <Form.Label>Purchase Price</Form.Label>
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
                      <Form.Label>Mrp</Form.Label>
                      <Form.Control
                        type="number"
                        name="mrp"
                        value={formData.mrp || ""}
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
                      Qty: <span>{product.stockQty}</span>
                    </p>
                    <p>
                      <span>{product.productName}</span>
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
