import React, { useState, useEffect } from "react";
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
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import imageCompression from "browser-image-compression";
import "./stock.css";
import LoaderC from "../utills/loaderC";

const Stock = () => {
  const notifyError = (message) => toast.error(message);
  const notifySuccess = (message) => toast.success(message);
  const [loading, setLoading] = useState(false);
  const [userUID, setUserUID] = useState(null);
  const [products, setProducts] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    productName: "",
    productDesc: "",
    brand: "",
    bulkPrice: "",
    retailPrice: "",
    wholesalePrice: "",
    stockQty: "",
    minStock: "",
    offerValue: "",
    category: "",
    rank: "",
    productImage: null,
    purchasePrice: "",
    mrp: "",
    wholesaleSellPrice: "",
    archived: false,
  });

  const [currentProductId, setCurrentProductId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("");
  useEffect(() => {
    const auth = getAuth();
    onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUserUID(currentUser.uid);
        fetchProducts(currentUser.uid);
      }
    });
  }, []);

  useEffect(() => {
    handleSearchAndSort();
  }, [searchTerm, sortOption, products]);

  useEffect(() => {
    if (userUID) {
      cacheProductImages(userUID);
    }
  }, [userUID]);

  const cacheProductImages = async (uid) => {
    try {
      // Get all product images from Firestore
      const imagesQuery = collection(db, "users", uid, "productImages");
      const imagesSnapshot = await getDocs(imagesQuery);

      // Create an object to store productId -> images[] mappings
      const imageCache = {};

      imagesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.productId) {
          // If this productId already has images, add to array, otherwise create new array
          if (!imageCache[data.productId]) {
            imageCache[data.productId] = [];
          }
          imageCache[data.productId].push({
            id: doc.id,
            ...data,
          });
        }
      });

      // Save to localStorage
      localStorage.setItem("productImages", JSON.stringify(imageCache));
      // console.log(JSON.stringify(imageCache));

      return imageCache;
    } catch (error) {
      notifyError("Error caching product images:", error);
      return {};
    }
  };

  const fetchProducts = async (uid) => {
    setLoading(true);
    try {
      const productsQuery = collection(db, "users", uid, "products");
      const querySnapshot = await getDocs(productsQuery);

      const productsList = await Promise.all(
        querySnapshot.docs.map(async (doc) => {
          const productData = { id: doc.id, ...doc.data() };

          if (productData.productId) {
            const imageDoc = await getDocs(
              query(
                collection(db, "users", uid, "productImages"),
                where("productId", "==", productData.productId)
              )
            );
            if (!imageDoc.empty) {
              productData.productImage = imageDoc.docs[0].data().productImage;
            }
          }
          return productData;
        })
      );

      setProducts(productsList);
    } catch (error) {
      notifyError("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAddNewClick = () => {
    resetForm();
    setShowAddModal(true);
  };
  const handleAddProduct = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID || !formData.productImage) return;

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
      };
      delete newProduct.productImage;

      await addDoc(collection(db, "users", userUID, "products"), newProduct);

      await setDoc(doc(db, "users", userUID, "productImages", productId), {
        productId,
        productImage: base64Image,
      });

      notifySuccess("Product added successfully");
      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error adding product:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditProduct = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID) return;

      let updatedData = { ...formData };
      delete updatedData.productImage;

      for (const key in updatedData) {
        if (updatedData[key] === undefined || updatedData[key] === "") {
          delete updatedData[key];
        }
      }

      await setDoc(
        doc(db, "users", userUID, "products", currentProductId),
        updatedData
      );

      if (formData.productImage) {
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

        await setDoc(
          doc(db, "users", userUID, "productImages", updatedData.productId),
          {
            productId: updatedData.productId,
            productImage: base64Image,
          }
        );
      }

      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error updating product:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveProduct = async () => {
    if (!userUID || !currentProductId) return;

    setLoading(true);
    try {
      await setDoc(
        doc(db, "users", userUID, "products", currentProductId),
        { archived: !formData.archived },
        { merge: true }
      );

      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error archiving product:", error);
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
        await deleteDoc(
          doc(db, "users", userUID, "products", currentProductId)
        );
        resetForm();
        await fetchProducts(userUID);
      } catch (error) {
        notifyError("Error deleting product:", error);
      } finally {
        setLoading(false);
      }
    }
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
      // wholesaleSellPrice: "",
      archived: false,
      productImage: null,
    });

    setShowAddModal(false);
    setShowEditModal(false);
  };

  const generateRandomCode = (length) => {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");
  };
  const openEditModal = (product) => {
    setCurrentProductId(product.id);
    setFormData({
      ...product,
      productImage: product.productImage, // Keep the existing image URL
    });
    setShowEditModal(true);
  };
  const handleSearchAndSort = () => {
    let allProducts = [...products];

    if (searchTerm) {
      allProducts = allProducts.filter((product) =>
        product.productName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (sortOption === "name") {
      allProducts.sort((a, b) => a.productName.localeCompare(b.productName));
    } else if (sortOption === "stockQty") {
      allProducts.sort((a, b) => a.stockQty - b.stockQty);
    }

    setActiveProducts(allProducts.filter((product) => !product.archived));
    setArchivedProducts(allProducts.filter((product) => product.archived));
  };
  return (
    <>
      {loading ? (
        <LoaderC />
      ) : (
        <div>
          <ToastContainer />
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
              </Form>
            </Modal.Body>
          </Modal>

          {/* Edit Product Modal */}
          <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title>Edit Product</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form onSubmit={handleEditProduct}>
                <Row>
                  {Object.keys(formData).map((key) =>
                    key !== "productImage" && key !== "archived" ? (
                      <Col xs={6} key={key}>
                        <Form.Group controlId={`edit${key}`}>
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
                        <Form.Group controlId={`edit${key}`}>
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
                    ) : null
                  )}

                  {/* {Object.keys(formData).map((key) =>
                    // Skip id, productId, productImage, and archived fields
                    !["id", "productId", "productImage", "archived"].includes(
                      key
                    ) ? (
                      <Col xs={6} key={key}>
                        <Form.Group controlId={`edit${key}`}>
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
                        <Form.Group controlId={`edit${key}`}>
                          <Form.Label>Product Image</Form.Label>
                          {formData.productImage && (
                            <div className="mb-2">
                              <img
                                src={formData.productImage}
                                alt="Current product"
                                style={{ maxWidth: "100px", height: "auto" }}
                              />
                            </div>
                          )}
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
                    ) : null
                  )} */}
                </Row>
                <div className="d-flex justify-content-between mt-3">
                  <Button variant="primary" type="submit">
                    Update Product
                  </Button>
                  <div>
                    <Button
                      variant="warning"
                      type="button"
                      onClick={handleArchiveProduct}
                      className="me-2"
                    >
                      {formData.archived ? "Unarchive" : "Archive"} Product
                    </Button>
                    <Button
                      variant="danger"
                      type="button"
                      onClick={handlePermanentDelete}
                    >
                      Delete Permanently
                    </Button>
                  </div>
                </div>
              </Form>
            </Modal.Body>
          </Modal>

          {/* Active Products */}
          <div className="product-flex-container m-1">
            {activeProducts.map((product) => (
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
                    <p className="mt-4">MRP: {product.mrp}</p>
                    <p>Bulk Price: {product.wholesalePrice}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Archived Products */}
          {archivedProducts.length > 0 && (
            <>
              <div className="product-flex-container m-1">
                {archivedProducts.map((product) => (
                  <div
                    className="product-card archived"
                    key={product.id}
                    style={{
                      backgroundImage: `url(${product.productImage})`,
                    }}
                    onClick={() => openEditModal(product)}
                  >
                    <div className="details">
                      <div className="p-2">
                        <div className="archived-badge">Archived</div>
                        <p>
                          QTY:
                          <span>{product.stockQty}</span>
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
            </>
          )}

          {/* Styles */}
          <style jsx>{`
            .product-flex-container {
              display: flex;
              flex-wrap: wrap;
              justify-content: flex-start;
              gap: 7px;
            }
            .product-card {
              flex: 1 1 100px;
              max-width: 120px;
              height: 150px;
              position: relative;
              background-size: 100%;
              background-repeat: no-repeat;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: rgba(14, 30, 37, 0.12) 0px 2px 4px 0px,
                rgba(14, 30, 37, 0.32) 0px 2px 16px 0px;
              display: flex;
              align-items: flex-start;
              color: white;
              cursor: pointer;
            }
            .details {
              height: 100%;
              color: white;
              background-color: rgba(58, 62, 70, 0.6);
              width: 100%;
            }
            .archived {
              opacity: 0.7;
            }
            .archived-badge {
              background-color: #dc3545;
              color: white;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 0.8em;
              position: absolute;
              top: 5px;
              right: 5px;
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default Stock;
