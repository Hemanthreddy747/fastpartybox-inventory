import React, { useState, useEffect } from "react";
import { getAuth, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { SubscriptionService } from "../services/subscriptionService";
import { SUBSCRIPTION_TIERS, TIER_PRICES } from "../config/constants";
import { toast } from "react-toastify";
import { Modal, Button, Card, Form } from "react-bootstrap";
import QRCode from "react-qr-code";
import "./more.css";

const More = () => {
  const [user, setUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [currentTier, setCurrentTier] = useState("FREE");
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [transactionId, setTransactionId] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: "",
    email: "",
    phoneNumber: "",
    address: "",
    businessName: "",
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const auth = getAuth();

  useEffect(() => {
    const loadUserData = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        setUser(currentUser);
        
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          const userData = userDoc.data();

          setProfileData({
            displayName: currentUser.displayName || "",
            email: currentUser.email || "",
            phoneNumber: userData?.phoneNumber || "",
            address: userData?.address || "",
            businessName: userData?.businessName || "",
          });

          if (userData) {
            setSubscriptionDetails({
              status: userData.subscriptionStatus || "active",
              tier: userData.subscriptionTier || "FREE",
              expiryDate: userData.subscriptionExpiry?.toDate?.() || new Date(userData.subscriptionExpiry),
              lastBilling: userData.lastBillingDate?.toDate?.() || null,
              createdAt: userData.createdAt?.toDate?.() || new Date(userData.createdAt),
            });
            setCurrentTier(userData.subscriptionTier || "FREE");
          }
        } catch (error) {
          console.error("Error loading user data:", error);
          toast.error("Error loading user data");
        }

        setLoading(false);
      }
    };

    loadUserData();
  }, [auth]);

  const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error("Date formatting error:", error);
      return 'N/A';
    }
  };

  const getDaysRemaining = () => {
    if (!subscriptionDetails?.expiryDate) return 0;
    const today = new Date();
    const expiry = new Date(subscriptionDetails.expiryDate);
    const diffTime = expiry - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const renderSubscriptionStatus = () => {
    const daysRemaining = getDaysRemaining();

    if (currentTier === "FREE" && daysRemaining <= 5 && daysRemaining > 0) {
      return (
        <div className="subscription-alert info">
          <i className="fas fa-clock"></i>
          {daysRemaining} days remaining in your free trial. Upgrade to premium for enhanced features.
        </div>
      );
    }
    return null;
  };

  const handleSignOut = () => {
    signOut(auth)
      .then(() => {
        // console.log("User signed out");
      })
      .catch((error) => {
        console.error("Error signing out: ", error);
        toast.error("Error signing out");
      });
  };

  const handleSave = () => {
    if (user) {
      updateProfile(user, {
        displayName,
      })
        .then(() => {
          setUser({ ...user, displayName });
          toast.success("Profile updated successfully");
        })
        .catch((error) => {
          console.error("Error updating profile: ", error);
          toast.error("Error updating profile");
        });
    }
  };

  const handleUpgrade = async (newTier) => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        subscriptionTier: newTier,
        subscriptionStatus: "active",
        subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        lastBillingDate: new Date(),
      });

      setCurrentTier(newTier);
      toast.success(`Successfully upgraded to ${newTier}`);

      // Refresh subscription details
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      setSubscriptionDetails({
        expiryDate: userData.subscriptionExpiry.toDate(),
        status: userData.subscriptionStatus,
        lastBilling: userData.lastBillingDate.toDate(),
      });
    } catch (error) {
      console.error("Error upgrading subscription:", error);
      toast.error("Failed to upgrade subscription");
    }
  };

  const generateUPILink = (tier) => {
    const upiId = "your-merchant-upi@upi"; // Replace with your UPI ID
    const paymentDescription = `Upgrade to ${tier} Plan (1 Year)`;
    const amount = SUBSCRIPTION_TIERS[tier]?.price || 0;
    return `upi://pay?pa=${upiId}&pn=FastBilling&tn=${paymentDescription}&am=${amount}&cu=INR`;
  };

  const handleUpgradeClick = (tier) => {
    setSelectedTier(tier);
    setPaymentStatus("pending");
    setTransactionId("");
    setShowPaymentModal(true);
  };

  const handlePaymentVerification = async () => {
    if (!transactionId.trim()) {
      toast.error("Please enter the transaction ID");
      return;
    }

    setPaymentStatus("verifying");

    try {
      // In a real app, verify the transaction with your backend
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulated verification

      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1); // Set expiry to 1 year from now

      await updateDoc(doc(db, "users", user.uid), {
        subscriptionTier: selectedTier,
        subscriptionStatus: "active",
        subscriptionExpiry: expiryDate,
        lastBillingDate: new Date(),
        transactionId: transactionId,
      });

      setCurrentTier(selectedTier);
      setPaymentStatus("completed");
      toast.success(`Successfully upgraded to ${selectedTier}`);

      setTimeout(() => {
        setShowPaymentModal(false);
      }, 2000);
    } catch (error) {
      console.error("Error verifying payment:", error);
      setPaymentStatus("failed");
      toast.error("Payment verification failed");
    }
  };

  const renderPaymentModal = () => (
    <Modal
      show={showPaymentModal}
      onHide={() => setShowPaymentModal(false)}
      centered
      className="payment-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>Upgrade to {selectedTier}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="payment-details">
          <div className="amount-display">
            <h3>Amount to Pay</h3>
            <div className="price">
              ₹{SUBSCRIPTION_TIERS[selectedTier]?.price || 0}
            </div>
            <div className="price-period">per year</div>
          </div>

          <div className="qr-section">
            <h4>Scan QR Code to Pay</h4>
            <div className="qr-container">
              <QRCode value={generateUPILink(selectedTier)} size={200} />
            </div>
          </div>

          <div className="payment-verification">
            <h4>Verify Payment</h4>
            <input
              type="text"
              placeholder="Enter UPI Transaction ID"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              className="transaction-input"
            />
            <Button
              onClick={handlePaymentVerification}
              disabled={paymentStatus === "verifying"}
              className="verify-button"
            >
              {paymentStatus === "verifying"
                ? "Verifying..."
                : "Verify Payment"}
            </Button>
          </div>

          {paymentStatus === "completed" && (
            <div className="success-message">
              <i className="fas fa-check-circle"></i>
              <p>Payment Successful!</p>
            </div>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );

  const renderSubscriptionDetails = () => {
    const tierDetails = SUBSCRIPTION_TIERS[currentTier];

    return (
      <div className="subscription-section">
        <div className="current-plan-card">
          <div className="plan-header">
            <h3>{currentTier} Plan</h3>
            <span className="status-badge">
              {subscriptionDetails?.status || "Active"}
            </span>
          </div>

          <div className="plan-details">
            <div className="limits">
              <div className="limit-item">
                <i className="fas fa-box"></i>
                <span>{tierDetails.maxProducts} Products</span>
              </div>
              <div className="limit-item">
                <i className="fas fa-shopping-cart"></i>
                <span>{tierDetails.maxOrders} Orders</span>
              </div>
            </div>

            <div className="features">
              <h4>Features</h4>
              <ul>
                {tierDetails.features.map((feature, index) => (
                  <li key={index}>
                    <i className="fas fa-check"></i>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {subscriptionDetails && (
              <div className="subscription-meta">
                <div className="meta-item">
                  <i className="fas fa-calendar-plus"></i>
                  <span>
                    Account Created: {formatDate(subscriptionDetails.createdAt)}
                  </span>
                </div>
                <div className="meta-item">
                  <i className="far fa-calendar-alt"></i>
                  <span>
                    {currentTier === "FREE" ? "Trial " : ""}
                    Expires: {formatDate(subscriptionDetails.expiryDate)}
                  </span>
                </div>
                {subscriptionDetails.lastBilling && (
                  <div className="meta-item">
                    <i className="fas fa-receipt"></i>
                    <span>
                      Last Billed: {formatDate(subscriptionDetails.lastBilling)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="upgrade-options">
          <h3>Upgrade Your Plan</h3>
          <div className="plans-grid">
            {Object.entries(SUBSCRIPTION_TIERS).map(
              ([tier, details]) =>
                tier !== currentTier && (
                  <Card key={tier} className="plan-card">
                    <Card.Header>
                      <h4>{tier}</h4>
                      <div className="price">
                        <span className="amount">₹{details.price}</span>
                        <span className="period">/year</span>
                      </div>
                    </Card.Header>
                    <Card.Body>
                      <div className="plan-features">
                        <div className="feature-item">
                          <i className="fas fa-box"></i>
                          <span>Up to {details.maxProducts} products</span>
                        </div>
                        <div className="feature-item">
                          <i className="fas fa-shopping-cart"></i>
                          <span>Up to {details.maxOrders} orders</span>
                        </div>
                        <ul>
                          {details.features.map((feature, index) => (
                            <li key={index}>
                              <i className="fas fa-check"></i>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Button
                        className="upgrade-button"
                        onClick={() => handleUpgradeClick(tier)}
                      >
                        Upgrade Now
                      </Button>
                    </Card.Body>
                  </Card>
                )
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleProfileUpdate = async () => {
    try {
      const currentUser = auth.currentUser;
      
      // Update auth profile (displayName)
      await updateProfile(currentUser, {
        displayName: profileData.displayName,
      });

      // Update additional profile data in Firestore
      await updateDoc(doc(db, "users", currentUser.uid), {
        phoneNumber: profileData.phoneNumber,
        address: profileData.address,
        businessName: profileData.businessName,
        updatedAt: new Date(),
      });

      toast.success("Profile updated successfully");
      setShowProfileModal(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Error updating profile");
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmNewPassword) {
      toast.error("New passwords don't match");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(
        user.email,
        passwordData.currentPassword
      );

      // First reauthenticate
      await reauthenticateWithCredential(user, credential);
      
      // Then update password
      await updatePassword(user, passwordData.newPassword);
      
      toast.success("Password updated successfully");
      setShowPasswordChange(false);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      });
    } catch (error) {
      console.error("Password update error:", error);
      if (error.code === 'auth/wrong-password') {
        toast.error("Current password is incorrect");
      } else {
        toast.error("Failed to update password");
      }
    }
  };

  const renderProfileModal = () => (
    <Modal
      show={showProfileModal}
      onHide={() => setShowProfileModal(false)}
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title>Edit Profile</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>Business Name</Form.Label>
            <Form.Control
              type="text"
              value={profileData.businessName}
              onChange={(e) => setProfileData({
                ...profileData,
                businessName: e.target.value
              })}
              placeholder="Enter business name"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Display Name</Form.Label>
            <Form.Control
              type="text"
              value={profileData.displayName}
              onChange={(e) => setProfileData({
                ...profileData,
                displayName: e.target.value
              })}
              placeholder="Enter display name"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Phone Number</Form.Label>
            <Form.Control
              type="tel"
              value={profileData.phoneNumber}
              onChange={(e) => setProfileData({
                ...profileData,
                phoneNumber: e.target.value
              })}
              placeholder="Enter phone number"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Address</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={profileData.address}
              onChange={(e) => setProfileData({
                ...profileData,
                address: e.target.value
              })}
              placeholder="Enter address"
            />
          </Form.Group>

          <div className="border-top pt-3 mt-3">
            {!showPasswordChange ? (
              <Button
                variant="outline-primary"
                className="w-100"
                onClick={() => setShowPasswordChange(true)}
              >
                <i className="fas fa-key me-2"></i>
                Change Password
              </Button>
            ) : (
              <Form onSubmit={handlePasswordChange}>
                <h6 className="mb-3">Change Password</h6>
                
                <Form.Group className="mb-3">
                  <Form.Label>Current Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({
                      ...passwordData,
                      currentPassword: e.target.value
                    })}
                    required
                    placeholder="Enter current password"
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>New Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({
                      ...passwordData,
                      newPassword: e.target.value
                    })}
                    required
                    placeholder="Enter new password"
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Confirm New Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={passwordData.confirmNewPassword}
                    onChange={(e) => setPasswordData({
                      ...passwordData,
                      confirmNewPassword: e.target.value
                    })}
                    required
                    placeholder="Confirm new password"
                  />
                </Form.Group>

                <div className="d-flex gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setShowPasswordChange(false);
                      setPasswordData({
                        currentPassword: '',
                        newPassword: '',
                        confirmNewPassword: ''
                      });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
                    Update Password
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowProfileModal(false)}>
          Close
        </Button>
        <Button variant="primary" onClick={handleProfileUpdate}>
          Save Changes
        </Button>
      </Modal.Footer>
    </Modal>
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="more-page">
      <div className="more-header">
        <button 
          className="more-profile-button" 
          onClick={() => setShowProfileModal(true)}
        >
          <i className="fas fa-user"></i> Profile
        </button>
        <button className="more-signout-button" onClick={handleSignOut}>
          <i className="fas fa-sign-out-alt"></i> Sign Out
        </button>
      </div>

      {renderProfileModal()}
      {renderSubscriptionStatus()}

      <div className="plans-container">
        {/* Current Plan Card */}
        <div className="plan-card current-plan">
          <div className="plan-header">
            <h2 className="plan-title">Current Plan</h2>
            <p className="plan-subtitle">{currentTier}</p>
            <div className="plan-badge">
              <i className="fas fa-check-circle"></i>
              {currentTier === "FREE" ? "Basic" : "Active"}
            </div>
          </div>

          <div className="plan-features">
            {/* <div className="feature-item">
              <i className="fas fa-box feature-icon"></i>
              <span>
                {SUBSCRIPTION_TIERS[currentTier].maxProducts} Products
              </span>
            </div>
            <div className="feature-item">
              <i className="fas fa-shopping-cart feature-icon"></i>
              <span>
                {SUBSCRIPTION_TIERS[currentTier].maxOrders} Orders/month
              </span>
            </div> */}
            {SUBSCRIPTION_TIERS[currentTier].features.map((feature, index) => (
              <div key={index} className="feature-item">
                <i className="fas fa-check feature-icon"></i>
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {subscriptionDetails && (
            <div className="plan-meta">
              <div className="feature-item">
                <i className="fas fa-calendar-plus feature-icon"></i>
                <span>
                  Account Created:{" "}
                  {subscriptionDetails.createdAt?.toLocaleDateString()}
                </span>
              </div>
              {currentTier === "FREE" && (
                <div className="feature-item">
                  <i className="fas fa-infinity feature-icon"></i>
                  <span>Unlimited Free Trial Period</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upgrade Plan Card */}
        {(currentTier === "FREE" || currentTier === "EXPIRED") && (
          <div className="plan-card upgrade-plan">
            <div className="plan-header">
              <h2 className="plan-title">Upgrade to Paid Plan</h2>
              <p className="plan-subtitle">
                Enhanced features for your business
              </p>
            </div>

            <div className="plan-option">
              <div className="plan-option-header">
                <div className="plan-name">PAID</div>
                <div className="plan-price">
                  <div className="price-amount">₹269/year</div>
                  <div className="price-period">Billed annually</div>
                  <div className="price-breakdown">
                    That's just ₹22.42 per month
                  </div>
                </div>
              </div>

              <div className="plan-features">
                {SUBSCRIPTION_TIERS.PAID.features.map((feature, index) => (
                  <div key={index} className="feature-item">
                    <i className="fas fa-check feature-icon"></i>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                className="upgrade-button"
                onClick={() => handleUpgradeClick("PAID")}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}
      </div>
      {renderPaymentModal()}
    </div>
  );
};

export default More;
