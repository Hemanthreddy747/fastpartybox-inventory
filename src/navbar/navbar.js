import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./navbar.css";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("");

  useEffect(() => {
    const path = location.pathname.substring(1);
    setActiveTab(path || "home");
  }, [location]);

  const handleTabClick = (tabName) => {
    // setActiveTab(tabName);
    navigate(`/${tabName}`);
  };

  return (
    <div className="navbarr user-select-none">
      <div
        className={activeTab === "home" ? "active" : ""}
        onClick={() => handleTabClick("home")}
      >
        home
      </div>
      <div
        className={activeTab === "billing" ? "active" : ""}
        onClick={() => handleTabClick("billing")}
      >
        billing
      </div>
      <div
        className={activeTab === "Wholesale" ? "active" : ""}
        onClick={() => handleTabClick("Wholesale")}
      >
        wholesale
      </div>
      <div
        className={activeTab === "stock" ? "active" : ""}
        onClick={() => handleTabClick("stock")}
      >
        stock
      </div>
      <div
        className={activeTab === "more" ? "active" : ""}
        onClick={() => handleTabClick("more")}
      >
        more
      </div>
    </div>
  );
};

export default Navbar;
