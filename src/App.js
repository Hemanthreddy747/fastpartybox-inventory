import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Login from "./login/login";

import Navbar from "./navbar/navbar";
import Home from "./pages/home";
import Billing from "./pages/billing";
import More from "./pages/more";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Stock from "./pages/stock";
import Wholesale from "./pages/wholesale";

function App() {
  return (
    <>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/home"
              element={
                <PrivateRoute>
                  <Navbar />
                  <Home />
                </PrivateRoute>
              }
            />
            <Route
              path="/billing"
              element={
                <PrivateRoute>
                  <Navbar />
                  <Billing />
                </PrivateRoute>
              }
            />
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
              path="/more"
              element={
                <PrivateRoute>
                  <Navbar />
                  <More />
                </PrivateRoute>
              }
            />

            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Login />
                </PrivateRoute>
              }
            />
            <Route path="/*" element={<Login />} />
          </Routes>
        </Router>
      </AuthProvider>
    </>
  );
}

export default App;
