// import React from "react";
// import "./billing.css";

// const Wholesale = () => {
//   // const navigate = useNavigate();

//   return (
//     <>
//       <div className="content  d-flex mx-auto">
//         <h1 className="mx-auto mt-4 pt-4">Wholesale </h1>
//       </div>
//     </>
//   );
// };

// export default Wholesale;

import React, { useState } from "react";
import axios from "axios";

const Wholesale = () => {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");

  const fetchCSV = async () => {
    try {
      const res = await axios.get("./data.csv", { responseType: "text" });
      const csvData = res.data.split("\n").map((row) => row.split(","));
      setData(csvData);
    } catch (error) {
      console.log(error);
      setError("Error fetching data");
    }
  };

  const tableHeader = ["id", "name", "age"];
  const tableRows = data.map((row, index) => (
    <tr key={index}>
      {tableHeader.map((header) => (
        <td>{row[header]}</td>
      ))}
    </tr>
  ));

  return (
    <>
      <button onClick={fetchCSV}>Fetch Data</button>
      {error && <p>{error}</p>}
      {data.length > 0 ? (
        <table>
          <thead>
            <tr>
              {tableHeader.map((header) => (
                <th>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>{tableRows}</tbody>
        </table>
      ) : null}
    </>
  );
};

export default Wholesale;
