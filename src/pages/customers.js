import React, { useState, useEffect, useCallback } from "react";
import { db } from "../firebase/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  deleteDoc,
  updateDoc,
  doc,
  getDoc,
  writeBatch,
  arrayUnion,
  increment,
  orderBy,
  limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Table, Button, Modal, Form, Spinner, Badge } from "react-bootstrap";
import { toast } from "react-toastify";
import "./customers.css";
import LoaderC from "../utills/loaderC";

const CustomersErrorBoundary = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="error-container">
        <h2>Something went wrong.</h2>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
      </div>
    );
  }

  return (
    <div
      onError={(error) => {
        console.error("Customers Error:", error);
        setHasError(true);
      }}
    >
      {children}
    </div>
  );
};

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [customerBills, setCustomerBills] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showBillsModal, setShowBillsModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
  });
  const [showCustomersModal, setShowCustomersModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [sortField, setSortField] = useState("date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedBill, setSelectedBill] = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [userUID, setUserUID] = useState(null); // Add this state variable

  // Add this useEffect to initialize userUID
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserUID(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const getSortedBills = (bills) => {
    return [...bills].sort((a, b) => {
      switch (sortField) {
        case "date":
          return sortDirection === "desc"
            ? (b.timestamp || 0) - (a.timestamp || 0)
            : (a.timestamp || 0) - (b.timestamp || 0);
        case "amount":
          return sortDirection === "desc"
            ? (b.total || 0) - (a.total || 0)
            : (a.total || 0) - (b.total || 0);
        case "status":
          return sortDirection === "desc"
            ? (b.paymentStatus || "").localeCompare(a.paymentStatus || "")
            : (a.paymentStatus || "").localeCompare(b.paymentStatus || "");
        case "unpaid":
          const balanceA = a.balanceDue || a.total || 0;
          const balanceB = b.balanceDue || b.total || 0;
          return sortDirection === "desc"
            ? balanceB - balanceA
            : balanceA - balanceB;
        default:
          return 0;
      }
    });
  };

  const BillsTable = ({ bills }) => {
    const sortedBills = getSortedBills(bills);

    const formatAmount = (amount) => {
      const num = parseFloat(amount);
      return isNaN(num) ? "0.00" : num.toFixed(2);
    };

    return (
      <Table
        responsive
        striped
        bordered
        hover
        size="sm"
        className="table-compact"
      >
        <thead>
          <tr>
            <th onClick={() => setSortField("date")}>
              Date{" "}
              {sortField === "date" && (sortDirection === "desc" ? "▼" : "▲")}
            </th>
            <th>Customer</th>
            <th onClick={() => setSortField("amount")}>
              Amount{" "}
              {sortField === "amount" && (sortDirection === "desc" ? "▼" : "▲")}
            </th>
            <th onClick={() => setSortField("unpaid")}>
              Due{" "}
              {sortField === "unpaid" && (sortDirection === "desc" ? "▼" : "▲")}
            </th>
            <th onClick={() => setSortField("status")}>
              Status{" "}
              {sortField === "status" && (sortDirection === "desc" ? "▼" : "▲")}
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedBills.map((bill) => (
            <tr key={bill.id}>
              <td>{new Date(bill.timestamp).toLocaleDateString()}</td>
              <td>{bill.customerInfo?.name}</td>
              <td>₹{formatAmount(bill.total)}</td>
              <td>₹{formatAmount(bill.balanceDue || bill.total)}</td>
              <td>
                <Badge
                  bg={
                    bill.paymentStatus === "full"
                      ? "success"
                      : bill.paymentStatus === "partial"
                      ? "warning"
                      : "danger"
                  }
                >
                  {bill.paymentStatus || "pending"}
                </Badge>
              </td>
              <td>
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="py-0 px-2"
                  onClick={() => {
                    setSelectedBill(bill);
                    setSelectedCustomer(bill.customerInfo);
                    setShowBillsModal(true);
                  }}
                >
                  Pay
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      fetchCustomerData(user.uid);
    }
  }, []);

  const fetchCustomerData = async (uid) => {
    if (!uid) return;
    setGlobalLoading(true);
    try {
      // Fetch customers
      const customersRef = collection(db, "users", uid, "customers");
      const customersSnapshot = await getDocs(customersRef);
      const customersData = customersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setCustomers(customersData);

      // Fetch wholesale orders for each customer
      const billsData = {};
      for (const customer of customersData) {
        const ordersRef = collection(db, "users", uid, "orders");
        const ordersQuery = query(
          ordersRef,
          where("orderType", "==", "wholesale"),
          where("customerInfo.id", "==", customer.id)
        );

        try {
          const ordersSnapshot = await getDocs(ordersQuery);
          billsData[customer.id] = ordersSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate?.() || new Date(), // Convert Firestore timestamp
          }));
        } catch (error) {
          console.error(
            `Error fetching bills for customer ${customer.id}:`,
            error
          );
          billsData[customer.id] = [];
        }
      }

      console.log("Fetched bills data:", billsData); // Debug log
      setCustomerBills(billsData);
    } catch (error) {
      console.error("Error fetching customer data:", error);
      toast.error("Failed to fetch customer data");
    } finally {
      setGlobalLoading(false);
    }
  };

  const validateForm = (customer) => {
    const errors = [];

    if (!customer.name?.trim()) {
      errors.push("Name is required");
    }

    if (customer.phone && !/^\d{10}$/.test(customer.phone.trim())) {
      errors.push("Phone number must be 10 digits");
    }

    return errors;
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      toast.error("Name and phone number are required");
      return;
    }

    try {
      setLoading(true);
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      // Check for duplicate phone number
      const duplicateQuery = query(
        collection(db, "users", user.uid, "customers"),
        where("phone", "==", newCustomer.phone.trim())
      );
      const duplicateSnapshot = await getDocs(duplicateQuery);
      if (!duplicateSnapshot.empty) {
        throw new Error("Customer with this phone number already exists");
      }

      const customerData = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        gst: newCustomer.gst?.trim() || null,
        email: newCustomer.email?.trim() || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        totalOrders: 0,
        totalSpent: 0,
        totalPaid: 0,
        status: "active",
      };

      await addDoc(
        collection(db, "users", user.uid, "customers"),
        customerData
      );

      // Reset form and close modal
      setNewCustomer({ name: "", phone: "", gst: "", email: "" });
      setShowAddCustomerModal(false);
      toast.success("Customer added successfully");
      await fetchCustomerData(user.uid);
    } catch (error) {
      console.error("Error adding customer:", error);
      toast.error(error.message || "Failed to add customer");
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm)
  );

  const handleDeleteCustomer = async (customerId) => {
    if (!window.confirm("Are you sure you want to delete this customer?"))
      return;

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      await deleteDoc(doc(db, "users", user.uid, "customers", customerId));
      toast.success("Customer deleted successfully");
      await fetchCustomerData(user.uid);
      setShowCustomersModal(false); // Add this line after successful deletion
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error("Failed to delete customer");
    }
  };

  const handleUpdateCustomer = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      await updateDoc(
        doc(db, "users", user.uid, "customers", selectedCustomer.id),
        {
          ...selectedCustomer,
          updatedAt: serverTimestamp(),
        }
      );

      toast.success("Customer updated successfully");
      await fetchCustomerData(user.uid);
      setShowEditModal(false);
    } catch (error) {
      console.error("Error updating customer:", error);
      toast.error("Failed to update customer");
    }
  };

  const validatePayment = (amount, total) => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error("Please enter a valid payment amount");
    }
    if (parsedAmount > total) {
      throw new Error(
        `Payment cannot exceed balance due (₹${total.toFixed(2)})`
      );
    }
    if (!/^\d+(\.\d{0,2})?$/.test(amount.toString())) {
      throw new Error("Amount cannot have more than 2 decimal places");
    }
    return parsedAmount;
  };

  const handlePayment = async (billId, amount, notes) => {
    if (!selectedCustomer || !billId) return;

    setProcessingPayment(true);
    const batch = writeBatch(db);
    const auth = getAuth();
    const user = auth.currentUser;

    try {
      const orderRef = doc(db, "users", user.uid, "orders", billId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error("Order not found");
      }

      const orderData = orderSnap.data();
      const balanceDue = orderData.balanceDue || orderData.total;

      // Validate payment amount
      const validatedAmount = validatePayment(amount, balanceDue);

      // Calculate new balance and status
      const newBalance = balanceDue - validatedAmount;
      const newStatus = newBalance <= 0 ? "paid" : "partial";

      // Create payment record with current timestamp
      const paymentRecord = {
        amount: validatedAmount,
        date: new Date().toISOString(), // Use ISO string instead of serverTimestamp
        notes: notes || "",
        balance: newBalance,
      };

      // Update order document
      batch.update(orderRef, {
        balanceDue: newBalance,
        paymentStatus: newStatus,
        payments: arrayUnion(paymentRecord),
      });

      // Update customer document
      const customerRef = doc(
        db,
        "users",
        user.uid,
        "customers",
        selectedCustomer.id
      );
      batch.update(customerRef, {
        totalDue: increment(-validatedAmount),
        totalPaid: increment(validatedAmount),
        lastPaymentDate: serverTimestamp(), // serverTimestamp is fine here since it's a direct update
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      await fetchCustomerData(user.uid);
      toast.success("Payment recorded successfully");
      setShowBillsModal(false);
      setSelectedBill(null);
      setSelectedCustomer(null);
    } catch (error) {
      console.error("Payment Error:", error);
      toast.error(error.message || "Failed to process payment");
    } finally {
      setProcessingPayment(false);
    }
  };

  const PaymentModal = ({ show, onHide, bill, onPayment }) => {
    const [paymentInfo, setPaymentInfo] = useState({
      amount: parseFloat(bill?.balanceDue || bill?.total || 0).toFixed(2),
      notes: "",
    });
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (processing) return;

      try {
        setProcessing(true);
        const balanceDue = parseFloat(bill?.balanceDue || bill?.total || 0);

        // Validate payment
        validatePayment(paymentInfo.amount, balanceDue);

        await onPayment(bill.id, paymentInfo.amount, paymentInfo.notes);
        onHide();
      } catch (error) {
        toast.error(error.message);
      } finally {
        setProcessing(false);
      }
    };

    return (
      <Modal show={show} onHide={processing ? null : onHide}>
        {processing && <LoaderC />}
        <Modal.Header closeButton={!processing}>
          <Modal.Title>Record Payment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Order Total</Form.Label>
              <Form.Control
                type="text"
                value={`₹${parseFloat(bill?.total || 0).toFixed(2)}`}
                disabled
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Balance Due</Form.Label>
              <Form.Control
                type="text"
                value={`₹${parseFloat(
                  bill?.balanceDue || bill?.total || 0
                ).toFixed(2)}`}
                disabled
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Payment Amount</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                min="0"
                max={bill?.balanceDue || bill?.total}
                value={paymentInfo.amount}
                onChange={(e) =>
                  setPaymentInfo({
                    ...paymentInfo,
                    amount: e.target.value,
                  })
                }
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Notes (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={paymentInfo.notes}
                onChange={(e) =>
                  setPaymentInfo({
                    ...paymentInfo,
                    notes: e.target.value,
                  })
                }
                placeholder="Add payment notes..."
              />
            </Form.Group>
            <div className="d-flex justify-content-end gap-2">
              <Button
                variant="secondary"
                onClick={onHide}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={processing}>
                {processing ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Processing...
                  </>
                ) : (
                  "Confirm Payment"
                )}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    );
  };

  const PaymentHistorySection = ({ bills }) => {
    return (
      <div className="payment-history">
        <h5>Payment History</h5>
        {bills?.map((bill) => (
          <div key={bill.id} className="mb-3">
            <h6>Order #{bill.id}</h6>
            <Table size="sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {bill.paymentHistory?.map((payment, index) => {
                  const formattedPayment = formatPayment(payment);
                  if (!formattedPayment) return null;

                  return (
                    <tr key={index}>
                      <td>{formattedPayment.date.toLocaleDateString()}</td>
                      <td>₹{formattedPayment.amount.toFixed(2)}</td>
                      <td>₹{formattedPayment.balance.toFixed(2)}</td>
                      <td>{formattedPayment.notes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ))}
        {(!bills || bills.length === 0) && (
          <p className="text-muted">No payment history available.</p>
        )}
      </div>
    );
  };

  const formatPayment = (payment) => {
    if (!payment || typeof payment !== "object") return null;
    return {
      ...payment,
      amount: parseFloat(payment.amount || 0),
      balance: parseFloat(payment.balance || 0),
      date: payment.date ? new Date(payment.date) : new Date(),
    };
  };

  const refreshCustomerData = async (customerId) => {
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser?.uid) {
      toast.error("No authenticated user found");
      return;
    }

    try {
      const customerRef = doc(
        db,
        "users",
        currentUser.uid,
        "customers",
        customerId
      );
      const customerSnap = await getDoc(customerRef);

      if (customerSnap.exists()) {
        const customerData = customerSnap.data();
        setCustomers((prev) =>
          prev.map((c) => (c.id === customerId ? { ...c, ...customerData } : c))
        );
      }
    } catch (error) {
      console.error("Error refreshing customer data:", error);
      toast.error("Failed to refresh customer data");
    }
  };

  // Add this new function for better customer management
  const updateCustomerMetrics = async (customerId, orderData) => {
    if (!customerId || !orderData || !userUID) return;

    const batch = writeBatch(db);

    try {
      const customerRef = doc(db, "users", userUID, "customers", customerId);
      const customerSnap = await getDoc(customerRef);

      if (!customerSnap.exists()) return;

      const customerData = customerSnap.data();
      const updatedMetrics = {
        totalPurchases: (customerData.totalPurchases || 0) + 1,
        totalAmount:
          (customerData.totalAmount || 0) + parseFloat(orderData.total || 0),
        averageOrderValue: (
          ((customerData.totalAmount || 0) + parseFloat(orderData.total || 0)) /
          ((customerData.totalPurchases || 0) + 1)
        ).toFixed(2),
        lastOrderDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
        paymentHistory: arrayUnion({
          amount: orderData.amountPaid || 0,
          date: serverTimestamp(),
          orderId: orderData.id,
          type: orderData.paymentMethod,
        }),
      };

      batch.update(customerRef, updatedMetrics);

      // Update customer analytics
      const analyticsRef = doc(db, "users", userUID, "analytics", "customers");
      batch.update(analyticsRef, {
        totalCustomers: increment(0),
        activeCustomers: increment(0),
        totalRevenue: increment(parseFloat(orderData.total || 0)),
        lastUpdated: serverTimestamp(),
      });

      await batch.commit();
    } catch (error) {
      console.error("Error updating customer metrics:", error);
      throw error;
    }
  };

  return (
    <CustomersErrorBoundary>
      {globalLoading && <LoaderC />}
      {processingPayment && <LoaderC />}

      <div className="customer-container">
        {/* Main Header Section */}
        <div className="header-section">
          <div className="header-content">
            <div className="d-flex justify-content-between align-items-center">
              <h2>Customers</h2>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-primary"
                  onClick={() => setShowCustomersModal(true)}
                >
                  <i className="fas fa-users"></i> View
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setShowAddCustomerModal(true)}
                >
                  <i className="fas fa-plus"></i> Add Customer
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Customers Modal */}
        <Modal
          show={showCustomersModal}
          onHide={() => setShowCustomersModal(false)}
          size="lg"
        >
          <Modal.Header closeButton>
            <Modal.Title>Customers List</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="mb-3">
              <Form.Control
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-100"
              />
            </div>

            {loading ? (
              <div className="text-center">
                <Spinner animation="border" />
              </div>
            ) : (
              <div className="table-responsive ">
                <Table
                  striped
                  bordered
                  hover
                  size="sm"
                  className="table-compact "
                >
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Bills</th>
                      <th>Due</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer) => {
                      const customerBillsArray =
                        customerBills[customer.id] || [];
                      const totalBills = customerBillsArray.length;
                      const totalDue = customerBillsArray.reduce(
                        (sum, bill) => sum + (bill.balanceDue || 0),
                        0
                      );

                      return (
                        <tr key={customer.id}>
                          <td className="align-middle">{customer.name}</td>
                          <td className="align-middle">
                            {customer.phone || "-"}
                          </td>
                          <td className="align-middle text-center">
                            {totalBills}
                          </td>
                          <td className="align-middle text-end">
                            ₹{totalDue.toFixed(2)}
                          </td>
                          <td className="action-cell">
                            <div className="d-flex gap-1 justify-content-center">
                              <Button
                                variant="outline-primary"
                                size="sm"
                                className="btn-compact"
                                title="View Bills"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setShowBillsModal(true);
                                  setShowCustomersModal(false);
                                }}
                              >
                                <i className="fas fa-file-invoice"></i>
                              </Button>
                              <Button
                                variant="outline-secondary"
                                size="sm"
                                className="btn-compact"
                                title="Edit"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setShowEditModal(true);
                                  setShowCustomersModal(false);
                                }}
                              >
                                <i className="fas fa-edit"></i>
                              </Button>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                className="btn-compact"
                                title="Delete"
                                onClick={() =>
                                  handleDeleteCustomer(customer.id)
                                }
                              >
                                <i className="fas fa-trash"></i>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowCustomersModal(false)}
            >
              Close
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Bills Section */}
        <div className="header-section">
          <div className="header-content">
            <div className="d-flex justify-content-between align-items-center">
              <h2>Wholesale Bills</h2>
            </div>
            <div className="d-flex gap-2">
              <Form.Control
                type="text"
                placeholder="Search bills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-50 flex-grow-1"
              />
              <Form.Select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                className="w-50"
              >
                <option value="date">Sort by Date</option>
                <option value="amount">Sort by Amount</option>
                <option value="unpaid">Sort by Due Amount</option>
                <option value="status">Sort by Status</option>
              </Form.Select>
              {/* <Button
                variant="outline-secondary"
                onClick={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
              >
                {sortDirection === "asc" ? "↑" : "↓"}
              </Button> */}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center">
            <Spinner animation="border" />
          </div>
        ) : (
          <BillsTable
            bills={Object.values(customerBills)
              .flat()
              .filter(
                (bill) =>
                  bill.customerInfo?.name
                    ?.toLowerCase()
                    .includes(searchTerm.toLowerCase()) ||
                  bill.localId?.includes(searchTerm)
              )}
          />
        )}

        {/* Add Customer Modal */}
        <Modal
          show={showAddCustomerModal}
          onHide={() => setShowAddCustomerModal(false)}
        >
          <Modal.Header closeButton>
            <Modal.Title>Add New Customer</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Customer Name*</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter customer name"
                  value={newCustomer.name}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      name: e.target.value,
                    })
                  }
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Phone Number*</Form.Label>
                <Form.Control
                  type="tel"
                  placeholder="Enter 10-digit phone number"
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      phone: e.target.value,
                    })
                  }
                  required
                />
                <Form.Text className="text-muted">
                  Enter 10-digit phone number without spaces or special
                  characters
                </Form.Text>
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowAddCustomerModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddCustomer}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                    className="me-2"
                  />
                  Adding...
                </>
              ) : (
                "Add Customer"
              )}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Payment Modal */}
        <Modal
          show={showBillsModal}
          onHide={() => setShowBillsModal(false)}
          size="lg"
        >
          <Modal.Header closeButton>
            <Modal.Title>Manage Payment - {selectedCustomer?.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedCustomer &&
            customerBills[selectedCustomer.id]?.length > 0 ? (
              <>
                <div className="bills-list mb-4">
                  <h5>Outstanding Bills</h5>
                  <Table striped bordered hover size="sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Total Amount</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerBills[selectedCustomer.id]
                        .filter((bill) => bill.balanceDue > 0)
                        .map((bill) => (
                          <tr key={bill.id}>
                            <td>
                              {new Date(bill.timestamp).toLocaleDateString()}
                            </td>
                            <td>₹{bill.total?.toFixed(2)}</td>
                            <td>₹{bill.amountPaid?.toFixed(2) || "0.00"}</td>
                            <td>₹{bill.balanceDue?.toFixed(2)}</td>
                            <td>
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => {
                                  setPaymentAmount(
                                    bill.balanceDue?.toString() || "0"
                                  );
                                  setSelectedBill(bill);
                                }}
                              >
                                Pay
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </Table>
                </div>
                <Form>
                  <Form.Group className="mb-3">
                    <Form.Label>Payment Amount</Form.Label>
                    <Form.Control
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Enter payment amount"
                      min="0"
                      step="0.01"
                    />
                  </Form.Group>
                </Form>
                <PaymentHistorySection
                  bills={customerBills[selectedCustomer.id]}
                />
              </>
            ) : (
              <div className="text-center py-4">
                <p>No bills found for this customer.</p>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowBillsModal(false)}
            >
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                handlePayment(selectedBill?.id, parseFloat(paymentAmount))
              }
              disabled={
                !selectedBill ||
                !paymentAmount ||
                parseFloat(paymentAmount) <= 0
              }
            >
              Record Payment
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Edit Customer Modal */}
        <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Edit Customer</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Customer Name*</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter customer name"
                  value={selectedCustomer?.name || ""}
                  onChange={(e) =>
                    setSelectedCustomer({
                      ...selectedCustomer,
                      name: e.target.value,
                    })
                  }
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Phone Number*</Form.Label>
                <Form.Control
                  type="tel"
                  placeholder="Enter phone number"
                  value={selectedCustomer?.phone || ""}
                  onChange={(e) =>
                    setSelectedCustomer({
                      ...selectedCustomer,
                      phone: e.target.value,
                    })
                  }
                  required
                />
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateCustomer}>
              Update Customer
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </CustomersErrorBoundary>
  );
};

export default Customers;
