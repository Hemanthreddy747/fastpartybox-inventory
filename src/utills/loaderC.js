import React from "react";

const LoaderC = () => {
  // Inline styles for the loader
  const loaderStyles = {
    display: "flex",
    flexDirection: "column", // Stack spinner and text vertically
    justifyContent: "center",
    alignItems: "center",
    height: "100vh", // Full viewport height
    width: "100vw", // Full viewport width
    position: "fixed", // Fixes the loader to the viewport
    top: 0,
    left: 0,
    zIndex: 9999, // Ensures it stays on top of other elements
  };

  const spinnerStyles = {
    border: "8px solid #f3f3f3", // Light grey
    borderTop: "8px solid #3498db", // Blue
    borderRadius: "50%",
    width: "60px", // Size of the loader
    height: "60px", // Size of the loader
    animation: "spin 1s linear infinite",
  };

  const textStyles = {
    marginTop: "1em", // Space between spinner and text
    fontSize: "1em", // Font size for the loading text
    color: "#000", // Text color
  };

  return (
    <div style={loaderStyles}>
      <div style={spinnerStyles}></div>
      {/* <div style={textStyles}>Data loading...</div> */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default LoaderC;
