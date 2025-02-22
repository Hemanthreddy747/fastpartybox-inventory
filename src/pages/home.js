import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  Button,
  Card,
  Modal,
  Pagination,
  Form,
  Row,
  Col,
  Badge,
} from "react-bootstrap";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp,
  increment,
  getDoc,
  where
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase/firebase";
import LoaderC from "../utills/loaderC";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import "./home.css";

const Home = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [userUID, setUserUID] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [syncStatus, setSyncStatus] = useState("synced");
  const [dateRange, setDateRange] = useState("today");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [stats, setStats] = useState({
    todaysSales: 0,
    weekSales: 0,
    monthSales: 0,
    totalOrders: 0,
  });
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [topSellingProducts, setTopSellingProducts] = useState([]);
  const [dailyStats, setDailyStats] = useState({
    averageOrderValue: 0,
    totalCustomers: 0,
    cancelledOrders: 0,
    returnRate: 0,
  });

  const ordersPerPage = 10;

  // Function to check for low stock products
  const checkLowStockProducts = async (uid) => {
    if (!uid) return;

    try {
      const productsRef = collection(db, "users", uid, "products");
      const querySnapshot = await getDocs(productsRef);

      const lowStock = querySnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((product) => product.stockQty <= (product.minStock || 5))
        .sort((a, b) => a.stockQty - b.stockQty);

      setLowStockProducts(lowStock);
    } catch (error) {
      console.error("Error checking low stock products:", error);
    }
  };

  // Function to calculate additional metrics
  const calculateAdditionalMetrics = (ordersList) => {
    if (!Array.isArray(ordersList)) return;

    const today = new Date();
    const todaysOrders = ordersList.filter((order) => {
      if (!order.timestamp) return false;
      const orderDate = new Date(order.timestamp);
      return orderDate.toDateString() === today.toDateString();
    });

    const completedOrders = todaysOrders.filter(
      (order) => order.status !== "cancelled"
    );
    const totalAmount = completedOrders.reduce(
      (sum, order) => sum + (parseFloat(order.total) || 0),
      0
    );
    const uniqueCustomers = new Set(
      todaysOrders.map((order) => order.customerInfo?.phone).filter(Boolean)
    ).size;
    const cancelledOrders = todaysOrders.filter(
      (order) => order.status === "cancelled"
    ).length;
    const returnRate =
      todaysOrders.length > 0
        ? ((cancelledOrders / todaysOrders.length) * 100).toFixed(1)
        : 0;

    setDailyStats({
      averageOrderValue:
        completedOrders.length > 0 ? totalAmount / completedOrders.length : 0,
      totalCustomers: uniqueCustomers,
      cancelledOrders: cancelledOrders,
      returnRate: returnRate,
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserUID(user.uid);
        loadAllOrders(user.uid);
        checkLowStockProducts(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadAllOrders = async (uid) => {
    if (!uid) {
      toast.error("User session not found");
      return;
    }

    setLoading(true);
    try {
      const offlineOrders = JSON.parse(
        localStorage.getItem("pendingOrders") || "[]"
      );
      const onlineOrders = await fetchOnlineOrders(uid);

      if (!Array.isArray(onlineOrders)) {
        throw new Error("Invalid online orders data");
      }

      const allOrders = [...offlineOrders, ...onlineOrders].sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return isNaN(dateA.getTime()) || isNaN(dateB.getTime())
          ? 0
          : dateB - dateA;
      });

      setOrders(allOrders);
      calculateStats(allOrders);
      calculateAdditionalMetrics(allOrders);

      if (offlineOrders.length > 0) {
        setSyncStatus("pending");
      }
    } catch (error) {
      console.error("Error loading orders:", error);
      toast.error(
        "Failed to load orders: " + (error.message || "Unknown error")
      );
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOnlineOrders = async (uid) => {
    if (!uid) return [];

    try {
      const ordersRef = collection(db, "users", uid, "orders");
      const q = query(ordersRef, orderBy("timestamp", "desc"), limit(100));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp:
          doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp),
        formattedDate: new Date(doc.data().timestamp).toLocaleString(),
        isOffline: false,
      }));
    } catch (error) {
      console.error("Error fetching online orders:", error);
      return [];
    }
  };

  const calculateStats = (ordersList) => {
    if (!Array.isArray(ordersList)) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      todaysSales: 0,
      weekSales: 0,
      monthSales: 0,
      totalOrders: ordersList.filter((order) => order.status !== "cancelled")
        .length,
      cancelledOrders: ordersList.filter(
        (order) => order.status === "cancelled"
      ).length,
    };

    ordersList.forEach((order) => {
      if (!order.timestamp || order.status === "cancelled") return;

      const orderDate = new Date(order.timestamp);
      if (isNaN(orderDate.getTime())) return;

      const orderAmount = parseFloat(order.total) || 0;

      if (orderDate >= today) {
        stats.todaysSales += orderAmount;
      }
      if (orderDate >= weekAgo) {
        stats.weekSales += orderAmount;
      }
      if (orderDate >= monthAgo) {
        stats.monthSales += orderAmount;
      }
    });

    setStats(stats);
  };

  const syncPendingOrders = async () => {
    if (!navigator.onLine || !userUID) return;

    const pendingOrders = JSON.parse(
      localStorage.getItem("pendingOrders") || "[]"
    );
    if (pendingOrders.length === 0) return;

    setSyncStatus("pending");
    const batch = writeBatch(db);

    try {
      for (const order of pendingOrders) {
        const orderRef = doc(collection(db, "users", userUID, "orders"));
        batch.set(orderRef, {
          ...order,
          syncedAt: serverTimestamp(),
          isOffline: false,
        });
      }

      await batch.commit();
      localStorage.setItem("pendingOrders", "[]");
      setSyncStatus("synced");
      toast.success("All orders synced successfully");
      loadAllOrders(userUID);
    } catch (error) {
      console.error("Error syncing orders:", error);
      setSyncStatus("error");
      toast.error("Error syncing orders");
    }
  };

  useEffect(() => {
    const handleOnline = () => syncPendingOrders();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [userUID]);

  const getFilteredOrders = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return orders.filter((order) => {
      const orderDate = new Date(order.timestamp);
      switch (dateRange) {
        case "today":
          return orderDate >= today;
        case "week":
          return (
            orderDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
          );
        case "month":
          return (
            orderDate >= new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
          );
        case "custom":
          const start = customStartDate
            ? new Date(customStartDate)
            : new Date(0);
          const end = customEndDate ? new Date(customEndDate) : new Date();
          return orderDate >= start && orderDate <= end;
        default:
          return true;
      }
    });
  };

  const downloadSalesData = (format = "xlsx") => {
    try {
      const filteredOrders = getFilteredOrders();
      
      // Product-wise aggregation
      const productStats = {};
      filteredOrders.forEach(order => {
        if (order.status !== "cancelled") {
          order.items?.forEach(item => {
            if (!productStats[item.id]) {
              productStats[item.id] = {
                productName: item.productName,
                totalQuantity: 0,
                totalAmount: 0,
                retailAmount: 0,
                wholesaleAmount: 0,
                purchaseAmount: 0,
                profit: 0,
                numberOfOrders: 0,
                returns: 0,
                brand: item.brand || 'N/A',
                category: item.category || 'N/A'
              };
            }
            const stats = productStats[item.id];
            stats.totalQuantity += item.quantity;
            stats.totalAmount += (item.quantity * item.retailPrice);
            stats.retailAmount += (item.quantity * (item.retailPrice || 0));
            stats.wholesaleAmount += (item.quantity * (item.wholesalePrice || 0));
            stats.purchaseAmount += (item.quantity * (item.purchasePrice || 0));
            stats.profit += (item.quantity * ((item.retailPrice || 0) - (item.purchasePrice || 0)));
            stats.numberOfOrders += 1;
          });
        }
      });

      // Prepare product analysis data
      const productData = Object.values(productStats).map(stat => ({
        "Product Name": stat.productName,
        "Brand": stat.brand,
        "Category": stat.category,
        "Total Quantity Sold": stat.totalQuantity,
        "Total Sales Amount": `₹${stat.totalAmount.toFixed(2)}`,
        "Total Retail Sales": `₹${stat.retailAmount.toFixed(2)}`,
        "Total Wholesale Sales": `₹${stat.wholesaleAmount.toFixed(2)}`,
        "Total Purchase Cost": `₹${stat.purchaseAmount.toFixed(2)}`,
        "Gross Profit": `₹${stat.profit.toFixed(2)}`,
        "Profit Margin %": `${((stat.profit / stat.totalAmount) * 100).toFixed(2)}%`,
        "Average Price": `₹${(stat.totalAmount / stat.totalQuantity).toFixed(2)}`,
        "Number of Orders": stat.numberOfOrders,
        "Returns": stat.returns,
        "Return Rate %": `${((stat.returns / stat.totalQuantity) * 100).toFixed(2)}%`
      }));

      // Prepare detailed sales data
      const salesData = filteredOrders.map(order => {
        const orderDate = new Date(order.timestamp);
        const itemsCost = order.items?.reduce((sum, item) => 
          sum + (item.quantity * (item.purchasePrice || 0)), 0) || 0;
        const orderTotal = parseFloat(order.total || 0);
        const orderProfit = orderTotal - itemsCost;

        return {
          "Basic Information": {
            "Date": orderDate.toLocaleDateString(),
            "Time": orderDate.toLocaleTimeString(),
            "Bill Number": order.id || order.localId,
            "Status": order.status === "cancelled" ? "Cancelled" : (order.isOffline ? "Pending Sync" : "Completed"),
            "Sales Type": order.salesType || "Retail",
            "Created By": order.createdBy || "N/A"
          },
          "Customer Information": {
            "Name": order.customerInfo?.name || "N/A",
            "Phone": order.customerInfo?.phone || "N/A",
            "Email": order.customerInfo?.email || "N/A",
            "Address": order.customerInfo?.address || "N/A",
            "GST Number": order.customerInfo?.gstNumber || "N/A",
            "Customer Type": order.customerInfo?.type || "Regular"
          },
          "Order Details": {
            "Number of Items": order.items?.length || 0,
            "Total Quantity": order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
            "Subtotal": `₹${orderTotal.toFixed(2)}`,
            "Discount": `₹${(order.discount || 0).toFixed(2)}`,
            "Tax": `₹${(order.tax || 0).toFixed(2)}`,
            "Total Amount": `₹${orderTotal.toFixed(2)}`,
            "Cost of Goods": `₹${itemsCost.toFixed(2)}`,
            "Gross Profit": `₹${orderProfit.toFixed(2)}`,
            "Profit Margin": `${((orderProfit / orderTotal) * 100).toFixed(2)}%`
          },
          "Payment Information": {
            "Payment Method": order.paymentMethod || "N/A",
            "Payment Status": order.paymentStatus || "N/A",
            "Transaction ID": order.transactionId || "N/A",
            "Payment Date": order.paymentDate ? new Date(order.paymentDate).toLocaleString() : "N/A",
            "Amount Paid": `₹${(order.amountPaid || 0).toFixed(2)}`,
            "Balance Due": `₹${(order.balanceDue || 0).toFixed(2)}`
          },
          "Items": order.items?.map(item => ({
            "Product Name": item.productName,
            "Brand": item.brand || "N/A",
            "Category": item.category || "N/A",
            "Quantity": item.quantity,
            "Unit Price": `₹${item.retailPrice.toFixed(2)}`,
            "Total": `₹${(item.quantity * item.retailPrice).toFixed(2)}`,
            "Cost Price": `₹${(item.purchasePrice || 0).toFixed(2)}`,
            "Profit": `₹${((item.retailPrice - (item.purchasePrice || 0)) * item.quantity).toFixed(2)}`
          })) || [],
          "Additional Information": {
            "Notes": order.notes || "N/A",
            "Tags": order.tags?.join(", ") || "N/A",
            "Reference Number": order.referenceNumber || "N/A"
          }
        };
      });

      // Prepare summary data
      const summaryData = {
        "Sales Summary": {
          "Total Orders": filteredOrders.length,
          "Completed Orders": filteredOrders.filter(o => o.status !== "cancelled").length,
          "Cancelled Orders": filteredOrders.filter(o => o.status === "cancelled").length,
          "Total Sales": `₹${filteredOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0).toFixed(2)}`,
          "Total Cost": `₹${filteredOrders.reduce((sum, o) => {
            return sum + (o.items?.reduce((itemSum, item) => 
              itemSum + (item.quantity * (item.purchasePrice || 0)), 0) || 0);
          }, 0).toFixed(2)}`,
          "Gross Profit": `₹${filteredOrders.reduce((sum, o) => {
            const total = parseFloat(o.total || 0);
            const cost = o.items?.reduce((itemSum, item) => 
              itemSum + (item.quantity * (item.purchasePrice || 0)), 0) || 0;
            return sum + (total - cost);
          }, 0).toFixed(2)}`,
          "Average Order Value": `₹${(filteredOrders.reduce((sum, o) => 
            sum + parseFloat(o.total || 0), 0) / 
            (filteredOrders.filter(o => o.status !== "cancelled").length || 1)).toFixed(2)}`
        },
        "Payment Summary": {
          "Cash Payments": `₹${filteredOrders.reduce((sum, o) => 
            o.paymentMethod === "cash" ? sum + parseFloat(o.total || 0) : sum, 0).toFixed(2)}`,
          "Card Payments": `₹${filteredOrders.reduce((sum, o) => 
            o.paymentMethod === "card" ? sum + parseFloat(o.total || 0) : sum, 0).toFixed(2)}`,
          "UPI Payments": `₹${filteredOrders.reduce((sum, o) => 
            o.paymentMethod === "upi" ? sum + parseFloat(o.total || 0) : sum, 0).toFixed(2)}`,
          "Other Payments": `₹${filteredOrders.reduce((sum, o) => 
            !["cash", "card", "upi"].includes(o.paymentMethod) ? sum + parseFloat(o.total || 0) : sum, 0).toFixed(2)}`
        }
      };

      if (format === "xlsx") {
        const workbook = XLSX.utils.book_new();

   

        // Create Products Analysis Sheet
        const productsWorksheet = XLSX.utils.json_to_sheet(productData);
        XLSX.utils.book_append_sheet(workbook, productsWorksheet, "Products Analysis");

        // Create Detailed Orders Sheet
        const detailedData = [];
        salesData.forEach((order) => {
          // Add order header
          detailedData.push(
            { "": "BASIC INFORMATION", "Details": "" },
            ...Object.entries(order["Basic Information"]).map(([key, value]) => 
              ({ "": key, "Details": value })),
            { "": "", "Details": "" },
            
            { "": "CUSTOMER INFORMATION", "Details": "" },
            ...Object.entries(order["Customer Information"]).map(([key, value]) => 
              ({ "": key, "Details": value })),
            { "": "", "Details": "" },
            
            { "": "ORDER DETAILS", "Details": "" },
            ...Object.entries(order["Order Details"]).map(([key, value]) => 
              ({ "": key, "Details": value })),
            { "": "", "Details": "" },
            
            { "": "PAYMENT INFORMATION", "Details": "" },
            ...Object.entries(order["Payment Information"]).map(([key, value]) => 
              ({ "": key, "Details": value })),
            { "": "", "Details": "" },
            
            { "": "ITEMS", "Details": "" }
          );

          // Add items details
          order.Items.forEach((item, index) => {
            detailedData.push(
              { "": `Item ${index + 1}`, "Details": "" },
              ...Object.entries(item).map(([key, value]) => 
                ({ "": key, "Details": value }))
            );
          });

          // Add additional information
          detailedData.push(
            { "": "", "Details": "" },
            { "": "ADDITIONAL INFORMATION", "Details": "" },
            ...Object.entries(order["Additional Information"]).map(([key, value]) => 
              ({ "": key, "Details": value })),
            { "": "", "Details": "" },
            { "": "------------------------", "Details": "------------------------" },
            { "": "", "Details": "" }
          );
        });

        const detailedWorksheet = XLSX.utils.json_to_sheet(detailedData);
        XLSX.utils.book_append_sheet(workbook, detailedWorksheet, "Detailed Orders");

        // Style worksheets
        [productsWorksheet, detailedWorksheet].forEach(worksheet => {
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          worksheet['!cols'] = [
            { wch: 30 }, // First column
            { wch: 50 }  // Second column
          ];
          
          // Style header row
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_col(C) + "1";
            if (!worksheet[address]) continue;
            worksheet[address].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "4472C4" } },
              alignment: { horizontal: "center" }
            };
          }
        });

        // Generate filename
        let fileName = 'sales_data';
        if (dateRange === 'custom' && customStartDate && customEndDate) {
          fileName += `_${customStartDate}_to_${customEndDate}`;
        } else {
          fileName += `_${dateRange}`;
        }
        fileName += '.xlsx';

        XLSX.writeFile(workbook, fileName);
        toast.success("Sales data downloaded successfully");
      }
    } catch (error) {
      console.error("Error downloading sales data:", error);
      toast.error("Failed to download sales data");
    }
  };

  const filteredOrders = getFilteredOrders();
  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentOrders = filteredOrders.slice(
    indexOfFirstOrder,
    indexOfLastOrder
  );
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);

  const handleCancelOrder = async (order) => {
    if (!userUID || !order?.id) {
      toast.error("Invalid order or user session");
      return;
    }

    // Basic validations
    if (order.status === "cancelled") {
      toast.error("Order is already cancelled");
      return;
    }

    if (order.isOffline) {
      toast.error("Cannot cancel offline orders. Please sync first");
      return;
    }

    // Confirm with user
    if (!window.confirm("Are you sure you want to cancel this order? Stock quantities will be restored.")) {
      return;
    }

    setLoading(true);

    try {
      // Validate order items
      if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
        throw new Error("No items found in order");
      }

      const batch = writeBatch(db);

      // Step 1: Get all product references and current data first
      const productRefs = {};
      const productData = {};
      
      for (const item of order.items) {
        if (!item.id || typeof item.quantity !== "number") {
          console.error("Invalid item:", item);
          continue;
        }
        
        const productRef = doc(db, "users", userUID, "products", item.id);
        productRefs[item.id] = productRef;
        
        // Get current product data
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
          console.error(`Product not found: ${item.id}`);
          continue;
        }
        
        productData[item.id] = productSnap.data();
      }

      // Step 2: Update order status
      const orderRef = doc(db, "users", userUID, "orders", order.id);
      batch.update(orderRef, {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelledBy: userUID,
        previousStatus: order.status,
        updatedAt: serverTimestamp()
      });

      // Step 3: Restore stock quantities
      for (const item of order.items) {
        if (!productRefs[item.id] || !productData[item.id]) continue;

        const currentStock = productData[item.id].stockQty || 0;
        const newStock = currentStock + item.quantity;

        console.log(`Restoring stock for ${item.productName}:`, {
          currentStock,
          quantityToRestore: item.quantity,
          newStock
        });

        batch.update(productRefs[item.id], {
          stockQty: newStock,
          lastUpdated: serverTimestamp(),
          lastStockChange: {
            type: "order_cancelled",
            amount: item.quantity,
            previousStock: currentStock,
            newStock: newStock,
            orderId: order.id,
            timestamp: serverTimestamp()
          }
        });
      }

      // Step 4: Commit all changes
      await batch.commit();

      // Step 5: Update local state for orders
      setOrders(prevOrders =>
        prevOrders.map(o =>
          o.id === order.id
            ? {
                ...o,
                status: "cancelled",
                cancelledAt: new Date().toISOString()
              }
            : o
        )
      );

      // Step 6: Update local state for products
      setProducts(prevProducts =>
        prevProducts.map(product => {
          const cancelledItem = order.items.find(item => item.id === product.id);
          if (cancelledItem) {
            return {
              ...product,
              stockQty: (product.stockQty || 0) + cancelledItem.quantity
            };
          }
          return product;
        })
      );

      toast.success("Order cancelled and stock quantities restored successfully");
      setShowOrderDetails(false);

    } catch (error) {
      console.error("Error cancelling order:", error);
      toast.error("Failed to cancel order: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to fetch products
  const fetchProducts = async (uid) => {
    if (!uid) return;
    
    try {
      const productsRef = collection(db, "users", uid, "products");
      const q = query(productsRef, where("archived", "!=", true));
      const querySnapshot = await getDocs(q);
      
      const productsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log("Fetched products:", productsData);
      setProducts(productsData);
      
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to refresh products");
    }
  };

  return (
    <>
      {loading && <LoaderC />}

      <div className="billing-history-container">
        <div className="summary-metrics">
          <div className="metric-card">
            <div className="metric-value">₹{stats.todaysSales.toFixed(2)}</div>
            <div className="metric-label">Today's Sales</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">₹{stats.weekSales.toFixed(2)}</div>
            <div className="metric-label">This Week's Sales</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">₹{stats.monthSales.toFixed(2)}</div>
            <div className="metric-label">This Month's Sales</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{stats.totalOrders}</div>
            <div className="metric-label">Total Orders</div>
          </div>
        </div>
        <div className="alert-section">
          {lowStockProducts.length > 0 && (
            <div className="alert-card critical">
              <div>
                <i className="fas fa-exclamation-triangle alert-icon"></i>
                <span>
                  {lowStockProducts.length} products below minimum stock level
                </span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => navigate("/stock")}
              >
                View Products
              </Button>
            </div>
          )}
          {syncStatus !== "synced" && (
            <div
              className={`sync-status-alert alert ${
                syncStatus === "error" ? "alert-danger" : "alert-warning"
              }`}
            >
              {syncStatus === "pending" ? (
                <>
                  <span>⚠️ Some orders are pending synchronization</span>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={syncPendingOrders}
                    disabled={!navigator.onLine}
                  >
                    Sync Now
                  </Button>
                </>
              ) : (
                <span>❌ Error syncing orders. Please try again later.</span>
              )}
            </div>
          )}
        </div>

        <div className="summary-metrics">
          <div className="metric-card">
            <div className="metric-value">
              ₹{dailyStats.averageOrderValue.toFixed(2)}
            </div>
            <div className="metric-label">Avg. Order Value</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{dailyStats.totalCustomers}</div>
            <div className="metric-label">Total Customers</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{dailyStats.cancelledOrders}</div>
            <div className="metric-label">Cancelled Orders</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{dailyStats.returnRate}%</div>
            <div className="metric-label">Return Rate</div>
          </div>
        </div>

        {/* <div className="chart-container">
          <h5>Sales Trend</h5>
          Add your preferred charting library here
        </div> */}

        {/* <div className="top-products">
          <h5>Top Selling Products</h5>
          <div className="product-list">
            {topSellingProducts.map((product, index) => (
              <div key={product.id} className="product-item">
                <div>
                  <strong>{product.name}</strong>
                  <div className="text-muted">Sold: {product.soldQuantity} units</div>
                </div>
                <div className={`badge ${product.stockQty <= product.minStock ? 'bg-danger' : 'bg-success'}`}>
                  Stock: {product.stockQty}
                </div>
              </div>
            ))}
          </div>
        </div> */}

        <div className="date-filter-container">
          <Form.Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </Form.Select>

          {dateRange === "custom" && (
            <>
              <Form.Control
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
              <Form.Control
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </>
          )}

          <div className="download-options">
            <Button
              variant="success"
              className="download-button"
              onClick={() => downloadSalesData("xlsx")}
            >
              <i className="fas fa-file-excel"></i> Download all sales data
            </Button>
            {/* <Button
              variant="info"
              className="download-button"
              onClick={() => downloadSalesData("csv")}
            >
              <i className="fas fa-file-csv"></i> Download CSV
            </Button> */}
          </div>
        </div>

        <div className="orders-table-container">
          <div className="table-header">
            <h3>Orders ({filteredOrders.length})</h3>
          </div>

          <Table responsive striped bordered hover>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentOrders.map((order) => (
                <tr key={order.id || order.localId}>
                  <td>{new Date(order.timestamp).toLocaleString()}</td>
                  <td>{order.customerInfo?.name || "N/A"}</td>
                  <td>{order.items?.length || 0}</td>
                  <td>₹{parseFloat(order.total).toFixed(2)}</td>
                  <td>
                    <Badge
                      bg={
                        order.status === "cancelled"
                          ? "danger"
                          : order.isOffline
                          ? "warning"
                          : "success"
                      }
                    >
                      {order.status === "cancelled"
                        ? "Cancelled"
                        : order.isOffline
                        ? "Pending Sync"
                        : "Completed"}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      variant="info"
                      size="sm"
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowOrderDetails(true);
                      }}
                    >
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <div className="pagination-container">
              <Pagination>
                {[...Array(totalPages)].map((_, index) => (
                  <Pagination.Item
                    key={index + 1}
                    active={index + 1 === currentPage}
                    onClick={() => setCurrentPage(index + 1)}
                  >
                    {index + 1}
                  </Pagination.Item>
                ))}
              </Pagination>
            </div>
          )}
        </div>

        <Modal
          show={showOrderDetails}
          onHide={() => setShowOrderDetails(false)}
          size="lg"
        >
          <Modal.Header closeButton>
            <Modal.Title>Order Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedOrder && (
              <>
                <h5>Customer Information</h5>
                <Table borderless size="sm">
                  <tbody>
                    <tr>
                      <td>
                        <strong>Name:</strong>
                      </td>
                      <td>{selectedOrder.customerInfo?.name || "N/A"}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Phone:</strong>
                      </td>
                      <td>{selectedOrder.customerInfo?.phone || "N/A"}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Email:</strong>
                      </td>
                      <td>{selectedOrder.customerInfo?.email || "N/A"}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Address:</strong>
                      </td>
                      <td>{selectedOrder.customerInfo?.address || "N/A"}</td>
                    </tr>
                  </tbody>
                </Table>

                <h5 className="mt-4">Items</h5>
                <Table striped bordered hover size="sm">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item, index) => (
                      <tr key={index}>
                        <td>{item.productName}</td>
                        <td>{item.quantity}</td>
                        <td>₹{parseFloat(item.retailPrice).toFixed(2)}</td>
                        <td>
                          ₹
                          {(
                            item.quantity * parseFloat(item.retailPrice)
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                <div className="text-end mt-3">
                  <h5>Total: ₹{parseFloat(selectedOrder.total).toFixed(2)}</h5>
                </div>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            {selectedOrder && selectedOrder.status !== "cancelled" && (
              <Button
                variant="danger"
                onClick={() => handleCancelOrder(selectedOrder)}
                disabled={loading}
              >
                {loading ? "Cancelling..." : "Cancel Order"}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setShowOrderDetails(false)}
            >
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </>
  );
};

export default Home;
