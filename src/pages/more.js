import React, { useState, useEffect } from "react";
import { getAuth, signOut, updateProfile } from "firebase/auth";
import "./more.css";

const More = () => {
  const [user, setUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const auth = getAuth();

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUser(currentUser);
      setDisplayName(currentUser.displayName || "");
    }
  }, [auth]);

  const handleSignOut = () => {
    signOut(auth)
      .then(() => {
        console.log("User signed out");
      })
      .catch((error) => {
        console.error("Error signing out: ", error);
      });
  };

  const handleSave = () => {
    if (user) {
      updateProfile(user, {
        displayName,
      })
        .then(() => {
          console.log("Profile updated successfully");
          setUser({ ...user, displayName });
        })
        .catch((error) => {
          console.error("Error updating profile: ", error);
        });
    }
  };

  return (
    <div className="container">
      <button
        className="profile-button"
        onClick={() => setShowProfile(!showProfile)}
      >
        Profile
      </button>
      <div className="">
        {showProfile && user && (
          <div className="profile-details">
            <div>
              <label>
                Display Name:
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
            </div>
            <button className="save-button" onClick={handleSave}>
              Save
            </button>
          </div>
        )}
      </div>

      <button className="sign-out-button" onClick={handleSignOut}>
        Sign Out
      </button>
    </div>
  );
};

export default More;
