import React, { useState, useEffect } from "react";
import { Table, Button, Card, Modal, Pagination } from "react-bootstrap";
import { collection, query, orderBy, limit, getDocs, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase/firebase";
import LoaderC from "../utills/loaderC";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import "./home.css";

const Home = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userUID, setUserUID] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'pending', 'error'
  const ordersPerPage = 10;

  // Load orders from localStorage and Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserUID(user.uid);
        loadAllOrders(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load both online and offline orders
  const loadAllOrders = async (uid) => {
    setLoading(true);
    try {
      // Load offline orders
      const offlineOrders = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
      
      // Load online orders
      const onlineOrders = await fetchOnlineOrders(uid);
      
      // Merge and sort orders
      const allOrders = [...offlineOrders, ...onlineOrders].sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      setOrders(allOrders);
      
      // Set sync status
      if (offlineOrders.length > 0) {
        setSyncStatus('pending');
      }
    } catch (error) {
      console.error("Error loading orders:", error);
      toast.error("Error loading orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchOnlineOrders = async (uid) => {
    if (!uid) return [];
    
    try {
      const ordersRef = collection(db, "users", uid, "orders");
      const q = query(ordersRef, orderBy("timestamp", "desc"), limit(50));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp),
        formattedDate: new Date(doc.data().timestamp).toLocaleString(),
        isOffline: false
      }));
    } catch (error) {
      console.error("Error fetching online orders:", error);
      return [];
    }
  };

  // Sync pending orders
  const syncPendingOrders = async () => {
    if (!navigator.onLine || !userUID) return;

    const pendingOrders = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
    if (pendingOrders.length === 0) return;

    setSyncStatus('pending');
    const batch = writeBatch(db);

    try {
      for (const order of pendingOrders) {
        const orderRef = doc(collection(db, "users", userUID, "orders"));
        batch.set(orderRef, {
          ...order,
          syncedAt: serverTimestamp(),
          isOffline: false
        });
      }

      await batch.commit();
      localStorage.setItem('pendingOrders', '[]');
      setSyncStatus('synced');
      toast.success("All orders synced successfully");
      loadAllOrders(userUID);
    } catch (error) {
      console.error("Error syncing orders:", error);
      setSyncStatus('error');
      toast.error("Error syncing orders");
    }
  };

  // Auto-sync when online
  useEffect(() => {
    const handleOnline = () => {
      syncPendingOrders();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [userUID]);

  const handleViewDetails = (order) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  const isToday = (date) => {
    const today = new Date();
    const orderDate = new Date(date);
    return (
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear()
    );
  };

  const todaysOrders = orders.filter((order) => isToday(order.timestamp));
  const todaysTotalSales = todaysOrders.reduce(
    (total, order) => total + (parseFloat(order.total) || 0),
    0
  );

  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentTodaysOrders = todaysOrders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.ceil(todaysOrders.length / ordersPerPage);

  const downloadSalesData = () => {
    try {
      const salesData = orders.map((order) => ({
        Date: new Date(order.timestamp).toLocaleString(),
        "Customer Name": order.customerInfo?.name || "N/A",
        "Customer Phone": order.customerInfo?.phone || "N/A",
        "Customer Email": order.customerInfo?.email || "N/A",
        "Customer Address": order.customerInfo?.address || "N/A",
        "Total Amount": order.total || 0,
        "Number of Items": order.items?.length || 0,
        "Order ID": order.id || order.localId,
        "Status": order.isOffline ? "Pending Sync" : "Synced"
      }));

      const ws = XLSX.utils.json_to_sheet(salesData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Data");
      XLSX.writeFile(wb, `sales_data_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast.success("Sales data downloaded successfully");
    } catch (error) {
      console.error("Error downloading sales data:", error);
      toast.error("Error downloading sales data");
    }
  };

  return (
    <>
      {loading && <LoaderC />}

      <div className="billing-history-container p-3">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <Card className="text-center p-0 flex-grow-1 me-3">
            <Card.Body>
              <Card.Title>Today's Total Sales</Card.Title>
              <Card.Text className="h2 text-success">
                ₹{todaysTotalSales.toFixed(2)}
              </Card.Text>
            </Card.Body>
          </Card>
          <Button variant="success" onClick={downloadSalesData}>
            Download Sales Data
          </Button>
        </div>

        {syncStatus !== 'synced' && (
          <div className={`sync-status-alert alert ${syncStatus === 'error' ? 'alert-danger' : 'alert-warning'}`}>
            {syncStatus === 'pending' ? (
              <>
                <span>⚠️ Some orders are pending synchronization</span>
                <Button 
                  variant="outline-primary" 
                  size="sm" 
                  className="ms-2"
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

        <div>
          <h3 className="mb-3">Today's Orders ({todaysOrders.length})</h3>
          <Table striped bordered hover responsive>
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
              {currentTodaysOrders.map((order) => (
                <tr key={order.id || order.localId}>
                  <td>{new Date(order.timestamp).toLocaleString()}</td>
                  <td>{order.customerInfo?.name || "N/A"}</td>
                  <td>{order.items?.length || 0}</td>
                  <td>₹{parseFloat(order.total).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${order.isOffline ? 'bg-warning' : 'bg-success'}`}>
                      {order.isOffline ? 'Pending Sync' : 'Synced'}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="info"
                      size="sm"
                      onClick={() => handleViewDetails(order)}
                    >
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <div className="d-flex justify-content-center mt-3">
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
                <p>Name: {selectedOrder.customerInfo?.name || "N/A"}</p>
                <p>Phone: {selectedOrder.customerInfo?.phone || "N/A"}</p>
                <p>Email: {selectedOrder.customerInfo?.email || "N/A"}</p>
                <p>Address: {selectedOrder.customerInfo?.address || "N/A"}</p>

                <h5 className="mt-4">Items</h5>
                <Table striped bordered hover>
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
                          ₹{(item.quantity * parseFloat(item.retailPrice)).toFixed(2)}
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
        </Modal>
      </div>
    </>
  );
};

export default Home;
