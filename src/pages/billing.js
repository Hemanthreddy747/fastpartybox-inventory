import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button, Form, Table, Modal, Spinner } from "react-bootstrap";
import { db } from "../firebase/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  limit,
  writeBatch,
  doc,
  increment,
  getDoc,
  addDoc, // Added this import
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./billing.css";
import LoaderC from "../utills/loaderC";
import { SubscriptionService } from "../services/subscriptionService";

// Create a simple error boundary component
const BillingErrorBoundary = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="error-container text-center p-5">
        <h2>Something went wrong</h2>
        <p>Please try refreshing the page</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Refresh Page
        </Button>
      </div>
    );
  }

  return (
    <div
      onError={(error) => {
        console.error("Billing Error:", error);
        setHasError(true);
      }}
    >
      {children}
    </div>
  );
};

const generateOrderId = () => {
  const timestamp = Date.now().toString();
  const randomNum = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `ORD${timestamp}${randomNum}`;
};

const Billing = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userUID, setUserUID] = useState(null);

  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("");
  const [globalLoading, setGlobalLoading] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [processingCart, setProcessingCart] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    id: "",
    name: "",
    phone: "",
    gst: "",
    email: "",
    amountPaid: 0,
    paymentStatus: "pending",
  });
  const [syncStatus, setSyncStatus] = useState("synced"); // 'synced', 'pending', 'error'
  const [pendingOrders, setPendingOrders] = useState([]);
  const [isWholesale, setIsWholesale] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [processingOrder, setProcessingOrder] = useState(false); // Add this state
  const [paymentInfo, setPaymentInfo] = useState({
    status: "full", // Can be 'full', 'partial', or 'none'
    amount: 0,
  });
  const [cartErrors, setCartErrors] = useState({});
  const [lastSync, setLastSync] = useState(null);
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);

  // Load pending orders from localStorage on component mount
  useEffect(() => {
    const stored = localStorage.getItem("pendingOrders");
    if (stored) {
      setPendingOrders(JSON.parse(stored));
      setSyncStatus("pending");
    }
  }, []);

  // Background sync function
  const syncPendingOrders = async () => {
    if (!navigator.onLine || !userUID) return;

    const stored = localStorage.getItem("pendingOrders");
    if (!stored) return;

    const orders = JSON.parse(stored);
    if (orders.length === 0) return;

    setSyncStatus("pending");

    for (const order of orders) {
      try {
        const batch = writeBatch(db);

        // Create order document
        const orderRef = doc(collection(db, "users", userUID, "orders"));
        batch.set(orderRef, {
          ...order,
          syncedAt: serverTimestamp(),
        });

        // Update product quantities
        order.items.forEach((item) => {
          const productRef = doc(db, "users", userUID, "products", item.id);
          batch.update(productRef, {
            stockQty: increment(-item.quantity),
          });
        });

        await batch.commit();

        // Remove synced order from pending list
        setPendingOrders((prev) =>
          prev.filter((o) => o.localId !== order.localId)
        );
        localStorage.setItem(
          "pendingOrders",
          JSON.stringify(
            pendingOrders.filter((o) => o.localId !== order.localId)
          )
        );

        notifySuccess(`Order ${order.localId} synced successfully`);
      } catch (error) {
        console.error("Error syncing order:", error);
        setSyncStatus("error");
      }
    }

    if (pendingOrders.length === 0) {
      setSyncStatus("synced");
    }
  };

  // Add online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      syncPendingOrders();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [userUID, pendingOrders]);

  const notifySuccess = (message) => toast.success(message);
  const notifyError = (message) => toast.error(message);

  const fetchProducts = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);
    setGlobalLoading(true);

    try {
      // Check cache first
      const cachedData = localStorage.getItem("productsCache");
      const cacheTimestamp = localStorage.getItem("productsCacheTimestamp");
      const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

      if (
        cachedData &&
        cacheTimestamp &&
        Date.now() - parseInt(cacheTimestamp) < CACHE_DURATION
      ) {
        const parsed = JSON.parse(cachedData);
        setProducts(parsed);
        setLoading(false);
        setGlobalLoading(false);

        // Fetch in background for updates
        fetchAndUpdateCache(uid);
        return;
      }

      await fetchAndUpdateCache(uid);
    } catch (error) {
      console.error("Error fetching products:", error);
      notifyError("Error fetching products");
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  }, []);

  const fetchAndUpdateCache = async (uid) => {
    const productsRef = collection(db, "users", uid, "products");
    const q = query(productsRef, where("archived", "==", false), limit(50));
    const querySnapshot = await getDocs(q);
    const productsList = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Batch fetch images with a single query
    const imagesRef = collection(db, "users", uid, "productImages");
    const imagesSnapshot = await getDocs(imagesRef);
    const imageMap = {};

    imagesSnapshot.docs.forEach((doc) => {
      const imageData = doc.data();
      if (imageData.productId && imageData.productImage) {
        imageMap[imageData.productId] = imageData.productImage;
      }
    });

    // Update products with images
    const productsWithImages = productsList.map((product) => ({
      ...product,
      productImage: imageMap[product.productId] || null,
    }));

    // Update cache
    localStorage.setItem("productsCache", JSON.stringify(productsWithImages));
    localStorage.setItem("productsCacheTimestamp", Date.now().toString());

    setProducts(productsWithImages);
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserUID(user.uid);
        fetchProducts(user.uid);
      }
    });
    return () => unsubscribe();
  }, [fetchProducts]);

  useEffect(() => {
    // Load cart from localStorage
    const savedCart = localStorage.getItem("currentCart");
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        setCart(parsedCart);
      } catch (error) {
        console.error("Error loading saved cart:", error);
      }
    }
  }, []);

  useEffect(() => {
    // Update localStorage whenever cart changes
    try {
      // First try to store with full data
      localStorage.setItem("currentCart", JSON.stringify(cart));
    } catch (error) {
      if (error.name === "QuotaExceededError") {
        try {
          // If quota exceeded, try storing without product images
          const compressedCart = cart.map((item) => {
            const { productImage, ...rest } = item;
            return rest;
          });
          localStorage.setItem("currentCart", JSON.stringify(compressedCart));
          console.warn("Stored cart without images due to storage limitations");
        } catch (innerError) {
          // If still failing, clear some space
          try {
            localStorage.removeItem("productImages"); // Remove cached images
            localStorage.setItem("currentCart", JSON.stringify(cart));
          } catch (finalError) {
            console.error("Failed to store cart in localStorage:", finalError);
            toast.warning(
              "Unable to save cart locally due to storage limitations"
            );
          }
        }
      }
    }
  }, [cart]);

  const addToCart = useCallback((product) => {
    if (!product.stockQty) {
      toast.error("Product out of stock");
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        if (existingItem.quantity >= product.stockQty) {
          toast.warning("Cannot exceed available stock");
          return prevCart;
        }
        return prevCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === productId);
      if (existingItem?.quantity > 1) {
        return prevCart.map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return prevCart.filter((item) => item.id !== productId);
    });
  }, []);

  const removeItemCompletely = useCallback((productId) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== productId));
  }, []);

  const updateQuantity = useCallback(
    (productId, newQuantity) => {
      // Convert to number and handle invalid/empty input
      const quantity = parseInt(newQuantity);

      // If input is empty, NaN, or 0, revert to previous quantity
      if (!quantity || isNaN(quantity) || quantity <= 0) {
        const currentItem = cart.find((item) => item.id === productId);
        if (currentItem) {
          setCart((prevCart) =>
            prevCart.map((item) =>
              item.id === productId
                ? { ...item, quantity: currentItem.quantity }
                : item
            )
          );
        }
        notifyError("Quantity must be at least 1");
        return;
      }

      const product = products.find((p) => p.id === productId);
      if (!product) {
        notifyError("Product not found");
        return;
      }

      if (quantity > product.stockQty) {
        notifyError("Cannot add more than available stock");
        // Revert to previous valid quantity
        const currentItem = cart.find((item) => item.id === productId);
        if (currentItem) {
          setCart((prevCart) =>
            prevCart.map((item) =>
              item.id === productId
                ? { ...item, quantity: currentItem.quantity }
                : item
            )
          );
        }
        return;
      }

      setCart((prevCart) =>
        prevCart.map((item) =>
          item.id === productId ? { ...item, quantity: quantity } : item
        )
      );
    },
    [products, cart]
  );

  const calculateTotal = useCallback(() => {
    return cart.reduce((total, item) => {
      const price = isWholesale ? item.wholesalePrice : item.retailPrice;
      return total + price * item.quantity;
    }, 0);
  }, [cart, isWholesale]);

  const getQuantityInCart = useCallback(
    (productId) => {
      const item = cart.find((item) => item.id === productId);
      return item ? item.quantity : 0;
    },
    [cart]
  );

  const reserveStock = async (items) => {
    if (!items?.length) return false;

    const batch = writeBatch(db);
    const reservations = [];

    try {
      for (const item of items) {
        const productRef = doc(db, "users", userUID, "products", item.id);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
          throw new Error(`Product ${item.productName} not found`);
        }

        const currentStock = productSnap.data().stockQty || 0;

        if (currentStock < item.quantity) {
          throw new Error(`Insufficient stock for ${item.productName}`);
        }

        batch.update(productRef, {
          stockQty: increment(-item.quantity),
          lastUpdated: serverTimestamp(),
          lastStockChange: {
            type: "SALE",
            quantity: -item.quantity,
            timestamp: serverTimestamp(),
          },
        });

        reservations.push({
          productId: item.id,
          quantity: item.quantity,
          timestamp: Date.now(),
        });
      }

      await batch.commit();
      return true;
    } catch (error) {
      console.error("Stock reservation failed:", error);
      notifyError(error.message);
      return false;
    }
  };

  const checkOrderLimit = async () => {
    return true; // Always allow orders
  };

  const validatePayment = (amount, total) => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error("Please enter a valid payment amount");
    }
    if (parsedAmount > total) {
      throw new Error(`Payment cannot exceed total amount (₹${total.toFixed(2)})`);
    }
    return parsedAmount;
  };

  const validateOrder = (cart, customerInfo, paymentInfo, total) => {
    const errors = {};

    if (!cart.length) {
      errors.cart = "Cart is empty";
    }

    if (isWholesale) {
      if (!customerInfo?.name?.trim()) {
        errors.customerName = "Customer name is required";
      }
      if (!customerInfo?.phone?.trim()) {
        errors.customerPhone = "Customer phone is required";
      }
      if (customerInfo?.phone && !/^\d{10}$/.test(customerInfo.phone.trim())) {
        errors.customerPhone = "Invalid phone number format";
      }
    }

    if (paymentInfo.status === "partial") {
      if (!paymentInfo.amount || paymentInfo.amount <= 0) {
        errors.payment = "Invalid payment amount";
      }
      if (paymentInfo.amount > total) {
        errors.payment = "Payment cannot exceed total amount";
      }
    }

    return errors;
  };

  const determinePaymentStatus = (balanceDue, total) => {
    if (balanceDue <= 0) return "paid";
    if (balanceDue === total) return "unpaid";
    return "partial";
  };

  const formatCustomerInfo = (customerInfo) => {
    return {
      id: customerInfo.id || null,
      name: customerInfo.name?.trim(),
      phone: customerInfo.phone?.trim(),
      email: customerInfo.email?.trim() || null,
      gst: customerInfo.gst?.trim() || null,
      address: customerInfo.address?.trim() || null,
    };
  };

  const handleCheckoutSuccess = () => {
    toast.success("Order completed successfully");
    setCart([]);
    setShowCheckoutModal(false);
    setCustomerInfo({
      name: "",
      phone: "",
      email: "",
      gst: "",
      address: "",
    });
    setPaymentInfo({
      status: "full",
      amount: 0,
      method: "cash",
    });
  };

  const handleCheckoutError = (error) => {
    console.error("Checkout error:", error);
    toast.error(error.message || "Failed to process order");
    
    // If there are validation errors, show them
    if (error.validationErrors) {
      setCartErrors(error.validationErrors);
    }
    
    // If there's a stock error, refresh product data
    if (error.message.includes("stock")) {
      fetchProducts(userUID); // Using the existing fetchProducts function
    }
  };

  const validateStockLevels = async (cart, userId) => {
    const batch = writeBatch(db);
    const stockLevels = {};
    const productRefs = {};

    try {
      // First, get all product references and current stock levels
      for (const item of cart) {
        const productRef = doc(db, "users", userId, "products", item.id);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
          throw new Error(`Product ${item.productName} no longer exists`);
        }

        const currentStock = productSnap.data().stockQty;
        stockLevels[item.id] = currentStock;
        productRefs[item.id] = productRef;

        if (currentStock < item.quantity) {
          throw new Error(
            `Insufficient stock for ${item.productName}. Available: ${currentStock}`
          );
        }
      }

      return {
        valid: true,
        stockLevels,
        productRefs,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  };

  const handleCheckout = async () => {
    if (processingCheckout) return;

    setProcessingCheckout(true);
    setCartErrors({});

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      const totalAmount = calculateTotal();
      const errors = validateOrder(
        cart,
        customerInfo,
        paymentInfo,
        totalAmount
      );

      if (Object.keys(errors).length > 0) {
        setCartErrors(errors);
        throw new Error("Please correct the errors before proceeding");
      }

      // Stock validation
      const stockValidationResults = await validateStockLevels(cart, user.uid);
      if (!stockValidationResults.valid) {
        throw new Error(stockValidationResults.error);
      }

      // Calculate payment details
      const amountPaid = calculateAmountPaid(paymentInfo, totalAmount);
      const balanceDue = parseFloat((totalAmount - amountPaid).toFixed(2));

      // Prepare order data
      const orderData = prepareOrderData({
        cart,
        totalAmount,
        amountPaid,
        balanceDue,
        customerInfo,
        stockValidationResults,
        user,
      });

      // Process order
      await processOrder(orderData, user.uid);

      // Success handling
      handleCheckoutSuccess();
    } catch (error) {
      handleCheckoutError(error);
    } finally {
      setProcessingCheckout(false);
    }
  };

  // Helper functions
  const calculateAmountPaid = (paymentInfo, total) => {
    return paymentInfo.status === "full"
      ? total
      : paymentInfo.status === "none"
      ? 0
      : parseFloat(paymentInfo.amount);
  };

  const prepareOrderData = ({
    cart,
    totalAmount,
    amountPaid,
    balanceDue,
    customerInfo,
    stockValidationResults,
    user,
  }) => {
    return {
      orderType: isWholesale ? "wholesale" : "retail",
      items: cart.map((item) => ({
        ...item,
        originalStock: stockValidationResults.stockLevels[item.id],
      })),
      total: totalAmount,
      amountPaid,
      balanceDue,
      paymentStatus: determinePaymentStatus(balanceDue, totalAmount),
      customerInfo: isWholesale ? formatCustomerInfo(customerInfo) : null,
      timestamp: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      localId: generateOrderId(),
      paymentHistory: [
        {
          amount: amountPaid,
          date: new Date().toISOString(),
          type: "initial",
          recordedBy: user.email,
          balance: balanceDue,
        },
      ],
      createdBy: user.email,
      createdAt: serverTimestamp(),
    };
  };

  const processOrder = async (orderData, userId) => {
    const batch = writeBatch(db);

    // Create order document
    const orderRef = doc(collection(db, "users", userId, "orders"));
    batch.set(orderRef, orderData);

    // Update product quantities
    orderData.items.forEach((item) => {
      const productRef = doc(db, "users", userId, "products", item.id);
      batch.update(productRef, {
        stockQty: increment(-item.quantity),
        lastSold: serverTimestamp(),
        totalSold: increment(item.quantity),
      });
    });

    // Update customer if wholesale
    if (isWholesale && orderData.customerInfo?.id) {
      const customerRef = doc(
        db,
        "users",
        userId,
        "customers",
        orderData.customerInfo.id
      );
      batch.update(customerRef, {
        totalPurchases: increment(1),
        totalSpent: increment(orderData.total),
        totalDue: increment(orderData.balanceDue),
        lastPurchase: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    // Handle offline storage
    if (!navigator.onLine) {
      const offlineOrders = JSON.parse(
        localStorage.getItem("offlineOrders") || "[]"
      );
      offlineOrders.push({ ...orderData, orderId: orderRef.id });
      localStorage.setItem("offlineOrders", JSON.stringify(offlineOrders));
    }
  };

  // Helper function to update dashboard stats
  const updateDashboardStats = async (userId) => {
    const statsRef = doc(db, "users", userId, "statistics", "dashboard");
    const batch = writeBatch(db);

    batch.set(
      statsRef,
      {
        lastOrderDate: serverTimestamp(),
        totalOrders: increment(1),
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );

    return batch.commit();
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm && sortOption === "") {
      return products.sort((a, b) => (a.stockQty <= 0) - (b.stockQty <= 0));
    }

    const searchLower = searchTerm.toLowerCase();
    return products
      .filter((product) =>
        product?.productName?.toLowerCase().includes(searchLower)
      )
      .sort((a, b) => {
        if (a.stockQty <= 0 !== b.stockQty <= 0) {
          return a.stockQty <= 0 ? 1 : -1;
        }
        if (sortOption === "name") {
          return (a.productName || "").localeCompare(b.productName || "");
        }
        if (sortOption === "price") {
          return (a.retailPrice || 0) - (b.retailPrice || 0);
        }
        return 0;
      });
  }, [products, searchTerm, sortOption]);

  const handleCartRecovery = () => {
    const savedCart = localStorage.getItem("currentCart");
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        setCart(parsedCart);
        notifySuccess("Cart recovered successfully");
      } catch (error) {
        console.error("Error recovering cart:", error);
        notifyError("Failed to recover cart");
      }
    }
  };

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        const customersRef = collection(db, "users", user.uid, "customers");
        const customersSnapshot = await getDocs(customersRef);
        const customersData = customersSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCustomers(customersData);
      } catch (error) {
        console.error("Error fetching customers:", error);
        toast.error("Failed to fetch customers");
      }
    };

    fetchCustomers();
  }, []);

  // Cart Modal Component
  const CartModal = () => {
    return (
      <Modal
        show={showCartModal}
        onHide={() => !processingCart && setShowCartModal(false)}
        size="lg"
      >
        {processingCart && <LoaderC />}
        <Modal.Header closeButton={!processingCart}>
          <Modal.Title>Cart</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex justify-content-between align-items-center mt-2 mb-3">
            <h4>Total: ₹{calculateTotal().toFixed(2)}</h4>
            <div className="cart-actions">
              <Button
                variant="danger"
                onClick={() => {
                  if (
                    window.confirm("Are you sure you want to clear the cart?")
                  ) {
                    setCart([]);
                    setShowCartModal(false);
                  }
                }}
                className="cancel-all-button me-2"
                disabled={processingCart}
              >
                Clear Cart
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowCartModal(false);
                  setShowCheckoutModal(true);
                }}
                disabled={cart.length === 0 || processingCart}
              >
                Proceed to Checkout
              </Button>
            </div>
          </div>

          <Table striped bordered hover>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}</td>
                  <td>
                    <div className="d-flex align-items-center">
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => removeFromCart(item.id)}
                        disabled={processingCart}
                      >
                        -
                      </Button>
                      <span className="mx-2">{item.quantity}</span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => addToCart(item)}
                        disabled={
                          processingCart || item.quantity >= item.stockQty
                        }
                      >
                        +
                      </Button>
                    </div>
                  </td>
                  <td>
                    ₹
                    {(isWholesale
                      ? item.wholesalePrice
                      : item.retailPrice
                    ).toFixed(2)}
                  </td>
                  <td>
                    ₹
                    {(
                      item.quantity *
                      (isWholesale ? item.wholesalePrice : item.retailPrice)
                    ).toFixed(2)}
                  </td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setCart(
                          cart.filter((cartItem) => cartItem.id !== item.id)
                        );
                      }}
                      disabled={processingCart}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
      </Modal>
    );
  };

  // Checkout Modal Component
  const CheckoutModal = () => {
    return (
      <Modal
        show={showCheckoutModal}
        onHide={processingCheckout ? null : () => setShowCheckoutModal(false)}
      >
        {processingCheckout && <LoaderC />}
        <Modal.Header closeButton={!processingCheckout}>
          <Modal.Title>
            {isWholesale ? "Wholesale Checkout" : "Checkout"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isWholesale ? (
            <Form>
              {/* Add Customer Selection Section */}
              <Form.Group className="mb-3">
                <Form.Label>Select Customer</Form.Label>
                <div className="d-flex gap-2">
                  <Form.Select
                    value={customerInfo.id || ""}
                    onChange={(e) => {
                      const selectedCustomer = customers.find(
                        (c) => c.id === e.target.value
                      );
                      if (selectedCustomer) {
                        setCustomerInfo({
                          id: selectedCustomer.id,
                          name: selectedCustomer.name,
                          phone: selectedCustomer.phone || "",
                          gst: selectedCustomer.gst || "",
                          paymentStatus:
                            customerInfo.paymentStatus || "pending",
                          amountPaid: customerInfo.amountPaid || 0,
                        });
                      } else {
                        setCustomerInfo({
                          name: "",
                          phone: "",
                          gst: "",
                          paymentStatus: "pending",
                          amountPaid: 0,
                        });
                      }
                    }}
                  >
                    <option value="">
                      Select existing customer or add new below
                    </option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone}
                      </option>
                    ))}
                  </Form.Select>
                  {/* <Button
                    variant="outline-primary"
                    onClick={() => {
                      setCustomerInfo({
                        name: "",
                        phone: "",
                        gst: "",
                        paymentStatus: "pending",
                        amountPaid: 0,
                      });
                    }}
                  >
                    <i className="fas fa-plus"></i> New
                  </Button> */}
                </div>
              </Form.Group>

              {/* Existing Customer Form Fields */}
              <Form.Group className="mb-3">
                <Form.Label>Customer Name*</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter customer name"
                  value={customerInfo.name || ''}
                  onChange={(e) => {
                    e.preventDefault();
                    const newValue = e.target.value;
                    setCustomerInfo(prevInfo => ({
                      ...prevInfo,
                      name: newValue,
                    }));
                  }}
                  onFocus={(e) => e.target.select()}
                  autoComplete="off"
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Phone Number*</Form.Label>
                <Form.Control
                  type="tel"
                  placeholder="Enter phone number"
                  value={customerInfo.phone || ''}
                  onChange={(e) => {
                    e.preventDefault();
                    const newValue = e.target.value;
                    setCustomerInfo(prevInfo => ({
                      ...prevInfo,
                      phone: newValue,
                    }));
                  }}
                  onFocus={(e) => e.target.select()}
                  autoComplete="off"
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>GST Number</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter GST number (optional)"
                  value={customerInfo.gst || ""}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      gst: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Form.Group>

              {/* Payment Section */}
              <div className="border p-3 mb-3 rounded">
                <h5>Payment Details</h5>
                <div className="total-amount mb-3">
                  <strong>Total Amount: ₹{calculateTotal().toFixed(2)}</strong>
                </div>

                <Form.Group className="mb-3">
                  <Form.Label>Payment Status</Form.Label>
                  <Form.Select
                    value={paymentInfo.status}
                    onChange={(e) =>
                      setPaymentInfo({
                        ...paymentInfo,
                        status: e.target.value,
                        amount:
                          e.target.value === "full" ? calculateTotal() : 0,
                      })
                    }
                  >
                    <option value="full">Full Payment</option>
                    <option value="partial">Partial Payment</option>
                    <option value="none">No Payment</option>
                  </Form.Select>
                </Form.Group>

                {paymentInfo.status === "partial" && (
                  <Form.Group className="mb-3">
                    <Form.Label>Payment Amount</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={paymentInfo.amount}
                      onChange={(e) =>
                        setPaymentInfo({
                          ...paymentInfo,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="Enter amount"
                    />
                  </Form.Group>
                )}
              </div>
            </Form>
          ) : (
            // Retail checkout summary
            <div className="retail-checkout-summary">
              <h5>Order Summary</h5>
              <Table striped bordered hover size="sm" className="mt-3">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, index) => (
                    <tr key={index}>
                      <td>{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>
                        ₹{isWholesale ? item.wholesalePrice : item.retailPrice}
                      </td>
                      <td>
                        ₹
                        {(
                          item.quantity *
                          (isWholesale ? item.wholesalePrice : item.retailPrice)
                        ).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="text-end mt-3">
                <h4>Total Amount: ₹{calculateTotal().toFixed(2)}</h4>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              if (!processingCheckout) {
                setShowCheckoutModal(false);
                setProcessingCheckout(false);
              }
            }}
            disabled={processingCheckout}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCheckout}
            disabled={processingCheckout}
          >
            {processingCheckout ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Processing...
              </>
            ) : (
              `Complete ${isWholesale ? "Wholesale" : "Retail"} Order`
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  };

  return (
    <BillingErrorBoundary>
      {globalLoading && <LoaderC />}

      <div className="billing-container">
        <div className="search-sort-section d-flex p-2 align-items-center">
          <Form.Control
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-50 me-2"
          />
          <Form.Select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="w-25 me-2"
          >
            <option value="">Sort by...</option>
            <option value="name">Name</option>
            <option value="price">Price</option>
          </Form.Select>
          <div className="mode-toggle">
            <input
              type="checkbox"
              id="billing-mode-switch"
              checked={isWholesale}
              onChange={(e) => {
                setIsWholesale(e.target.checked);
                setCart([]);
              }}
            />
            <label className="toggle-slider" htmlFor="billing-mode-switch">
              <span className="switch-text">
                {isWholesale ? "Wholesale" : "Retail"}
              </span>
            </label>
          </div>
        </div>

        <div className="billing-content">
          <div className="product-flex-container">
            {filteredProducts.map((product) => (
              <div
                className={`product-card ${
                  getQuantityInCart(product.id) > 0 ? "has-items" : ""
                } ${product.stockQty <= 0 ? "out-of-stock" : ""}`}
                key={product.id}
                style={{
                  backgroundImage: product.productImage
                    ? `url(${product.productImage})`
                    : "url(https://via.placeholder.com/150)",
                  cursor: product.stockQty <= 0 ? "not-allowed" : "pointer",
                }}
                onClick={() => product.stockQty > 0 && addToCart(product)}
              >
                {product.stockQty <= 0 && (
                  <div className="out-of-stock-badge">Out of Stock</div>
                )}
                {getQuantityInCart(product.id) > 0 ? (
                  <>
                    <div className="product-quantity-badge">
                      {getQuantityInCart(product.id)}
                    </div>
                    <button
                      className="product-minus-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(product.id);
                      }}
                    >
                      -
                    </button>
                  </>
                ) : (
                  product.stockQty > 0 && (
                    <div className="product-plus-indicator">+</div>
                  )
                )}
                <div className="details">
                  <div className="p-2">
                    <p className="productnameoncard">
                      <span>{product.productName}</span>
                    </p>
                    <p>
                      Qty: <span>{product.stockQty}</span>
                    </p>
                    <p className="">
                      {isWholesale ? "Wholesale" : "MRP"}: ₹
                      {isWholesale ? product.wholesalePrice : product.mrp}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {cart.length > 0 && (
            <div
              className="floating-cart"
              onClick={() => setShowCartModal(true)}
            >
              <div className="cart-total">₹{calculateTotal()}</div>
              <div className="cart-counter">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CartModal />
      <CheckoutModal />

      {/* Sync Status Indicator */}
      <div className="sync-status-indicator">
        {syncStatus === "error" && (
          <span className="text-danger">❌ Sync error</span>
        )}
        {syncStatus === "synced" && (
          <span className="text-success">✓ Synced</span>
        )}
      </div>
    </BillingErrorBoundary>
  );
};

export default Billing;
