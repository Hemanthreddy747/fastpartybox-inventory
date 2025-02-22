import React, { useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { PerformanceMonitor } from "./services/performanceMonitor";
import Login from "./login/login";
import Navbar from "./navbar/navbar";
import Home from "./pages/home";
import Billing from "./pages/billing";
import More from "./pages/more";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Stock from "./pages/stock";
import Wholesale from "./pages/wholesale";
import { ToastContainer } from "react-toastify";
import { initializeAuthListener } from './services/authService';

function App() {
  useEffect(() => {
    // Initialize performance monitoring
    PerformanceMonitor.logPageView('app_start');
    initializeAuthListener();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router basename="/">
          <ToastContainer
            position="bottom-left"
            autoClose={3000}
            limit={3}
            theme="colored"
          />
          <Routes>
            <Route exact path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={
              <PrivateRoute>
                <Navbar />
                <Home />
              </PrivateRoute>
            } />
            <Route path="/billing" element={
              <PrivateRoute>
                <Navbar />
                <Billing />
              </PrivateRoute>
            } />
            <Route
              path="/wholesale"
              element={
                <PrivateRoute>
                  <Navbar />
                  <Wholesale />
                </PrivateRoute>
              }
            />
            <Route
              path="/stock"
              element={
                <PrivateRoute>
                  <Navbar />
                  <Stock />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Navbar />
                  <More />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
