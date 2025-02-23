import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, query, where, getDocs, doc, getDoc,
  orderBy, limit, writeBatch, serverTimestamp
} from "firebase/firestore";
import { toast } from "react-toastify";
import LoaderC from "../utills/loaderC";
import "./home.css";
import { Table, Badge } from 'react-bootstrap';

const Home = () => {
  // Core states
  const [loading, setLoading] = useState(false);
  const [userUID, setUserUID] = useState(null);
  const [businessName, setBusinessName] = useState("");

  // Data states
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({
    todaysSales: 0,
    weekSales: 0,
    monthSales: 0,
    totalOrders: 0,
    pendingPayments: 0,
    averageOrderValue: 0
  });
  
  // Dashboard insights
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [topSellingProducts, setTopSellingProducts] = useState([]);
  const [customerMetrics, setCustomerMetrics] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    totalDue: 0,
    averageOrderValue: 0
  });

  // Filters and pagination
  const [dateRange, setDateRange] = useState("today");
  const [currentPage, setCurrentPage] = useState(1);
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const ordersPerPage = 10;

  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserUID(user.uid);
        await loadInitialData(user.uid);
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const loadInitialData = async (uid) => {
    setLoading(true);
    try {
      await Promise.all([
        loadBusinessInfo(uid),
        loadOrders(uid),
        loadProducts(uid),
        checkLowStock(uid)
      ]);
    } catch (error) {
      console.error("Error loading initial data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const loadBusinessInfo = async (uid) => {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        setBusinessName(userDoc.data().businessName || "");
      }
    } catch (error) {
      console.error("Error loading business info:", error);
    }
  };

  const loadOrders = async (uid) => {
    try {
      const ordersRef = collection(db, "users", uid, "orders");
      const q = query(ordersRef, orderBy("timestamp", "desc"), limit(100));
      const snapshot = await getDocs(q);
      
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date()
      }));

      setOrders(ordersData);
      calculateStats(ordersData);
      calculateCustomerMetrics(ordersData);
    } catch (error) {
      console.error("Error loading orders:", error);
    }
  };

  const loadProducts = async (uid) => {
    try {
      const productsRef = collection(db, "users", uid, "products");
      const q = query(productsRef, where("archived", "==", false));
      const snapshot = await getDocs(q);
      
      const productsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setProducts(productsData);
      analyzeTopProducts(productsData, orders);
    } catch (error) {
      console.error("Error loading products:", error);
    }
  };

  const checkLowStock = async (uid) => {
    try {
      const productsRef = collection(db, "users", uid, "products");
      const snapshot = await getDocs(productsRef);
      
      const lowStock = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(product => product.stockQty <= (product.minStock || 5))
        .sort((a, b) => a.stockQty - b.stockQty)
        .slice(0, 5);

      setLowStockProducts(lowStock);
    } catch (error) {
      console.error("Error checking low stock:", error);
    }
  };

  const calculateStats = (ordersData) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newStats = {
      todaysSales: 0,
      weekSales: 0,
      monthSales: 0,
      totalOrders: ordersData.length,
      pendingPayments: 0,
      averageOrderValue: 0
    };

    ordersData.forEach(order => {
      const orderDate = new Date(order.timestamp);
      const orderAmount = parseFloat(order.total) || 0;

      if (orderDate >= today) {
        newStats.todaysSales += orderAmount;
      }
      if (orderDate >= weekAgo) {
        newStats.weekSales += orderAmount;
      }
      if (orderDate >= monthAgo) {
        newStats.monthSales += orderAmount;
      }
      if (order.balanceDue > 0) {
        newStats.pendingPayments += order.balanceDue;
      }
    });

    newStats.averageOrderValue = ordersData.length > 0 
      ? newStats.monthSales / ordersData.length 
      : 0;

    setStats(newStats);
  };

  const calculateCustomerMetrics = (ordersData) => {
    const uniqueCustomers = new Set();
    const activeCustomers = new Set();
    let totalDue = 0;
    let totalOrderValue = 0;

    // Consider orders from last 30 days for active customers
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    ordersData.forEach(order => {
      if (order.customerInfo?.id) {
        uniqueCustomers.add(order.customerInfo.id);
        
        // Check if customer is active (ordered in last 30 days)
        if (order.timestamp > thirtyDaysAgo) {
          activeCustomers.add(order.customerInfo.id);
        }

        // Calculate dues and order values
        totalDue += order.balanceDue || 0;
        totalOrderValue += order.total || 0;
      }
    });

    setCustomerMetrics({
      totalCustomers: uniqueCustomers.size,
      activeCustomers: activeCustomers.size,
      totalDue: totalDue,
      averageOrderValue: uniqueCustomers.size ? totalOrderValue / uniqueCustomers.size : 0
    });
  };

  const analyzeTopProducts = (productsData, ordersData) => {
    const productSales = {};

    // Initialize sales data for all products
    productsData.forEach(product => {
      productSales[product.id] = {
        id: product.id,
        name: product.name,
        totalQuantity: 0,
        totalRevenue: 0
      };
    });

    // Calculate sales from orders
    ordersData.forEach(order => {
      order.items?.forEach(item => {
        if (productSales[item.id]) {
          productSales[item.id].totalQuantity += item.quantity || 0;
          productSales[item.id].totalRevenue += (item.price * item.quantity) || 0;
        }
      });
    });

    // Convert to array and sort by revenue
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    setTopSellingProducts(topProducts);
  };

  return (
    <div className="dashboard-container">
      {loading && <LoaderC />}

      {/* Business Header */}
      {businessName && (
        <div className="business-header">
          <h1>{businessName}</h1>
        </div>
      )}

      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="stat-card">
          <h3>Today's Sales</h3>
          <p>₹{stats.todaysSales.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h3>Weekly Sales</h3>
          <p>₹{stats.weekSales.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h3>Monthly Sales</h3>
          <p>₹{stats.monthSales.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h3>Pending Payments</h3>
          <p>₹{stats.pendingPayments.toFixed(2)}</p>
        </div>
      </div>

      {/* Insights Section */}
      <div className="insights-section">
        {/* Low Stock Alert */}
        {lowStockProducts.length > 0 && (
          <div className="low-stock-alert">
            <i className="bi bi-exclamation-triangle-fill text-warning"></i>
            <span>{lowStockProducts.length} products on low stock</span>
          </div>
        )}
      </div>

      {/* Recent Orders */}
      <div className="recent-orders">
        <h3>Recent Orders</h3>
        <Table responsive striped bordered hover size="sm" className="table-compact">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Order Type</th>
              <th>Amount</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 5).map(order => (
              <tr key={order.id}>
                <td>{new Date(order.timestamp).toLocaleDateString()}</td>
                <td>{order.customerInfo?.name || 'Retail Customer'}</td>
                <td>{order.orderType || 'retail'}</td>
                <td className="text-end">₹{order.total?.toFixed(2)}</td>
                <td className="text-end">₹{order.balanceDue?.toFixed(2) || '0.00'}</td>
                <td>
                  <Badge bg={
                    order.paymentStatus === 'full' ? 'success' :
                    order.paymentStatus === 'partial' ? 'warning' : 'danger'
                  }>
                    {order.paymentStatus || 'pending'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

export default Home;
