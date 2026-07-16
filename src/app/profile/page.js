"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useState } from "react";
import { auth } from "../../../firebaseConfig";
import { updateProfile } from "firebase/auth";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setDisplayName(currentUser?.displayName || "");
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser || !displayName.trim()) return;
    try {
      await updateProfile(auth.currentUser, { displayName });
      setUser({ ...auth.currentUser, displayName });
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      console.error("Error updating profile:", err);
      setStatus("Error saving.");
    }
  };

  const renderAvatar = () => {
    const initial = user?.displayName?.charAt(0)?.toUpperCase() || "U";
    return (
      <div
        className={layoutStyles.extracted1}
      >
        {initial}
      </div>
    );
  };

  return (
    <HeaderSidebarLayout>
      <div className={layoutStyles.extracted2}>
        <div className={layoutStyles.extracted3}>
          <h1 className={layoutStyles.extracted4}>
            Account Settings
          </h1>

          {user ? (
            <div
              className={layoutStyles.extracted5}
            >
              <div className={layoutStyles.extracted6}>{renderAvatar()}</div>

              <div>
                <label className={layoutStyles.extracted7}>Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Name"
                  className={layoutStyles.extracted8}
                />
                <small className={layoutStyles.extracted9}>
                  The name associated with this account
                </small>
              </div>

              <div>
                <label className={layoutStyles.extracted10}>Email address</label>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  className={layoutStyles.extracted11}
                />
                <small className={layoutStyles.extracted12}>
                  The email address associated with this account
                </small>
              </div>

              <div>
                <label className={layoutStyles.extracted13}>Phone number</label>
                <input
                  type="text"
                  value={user.phoneNumber || "+44"}
                  disabled
                  className={layoutStyles.extracted14}
                />
                <small className={layoutStyles.extracted15}>
                  The phone number associated with this account
                </small>
              </div>

              <button
                onClick={handleSave}
                className={layoutStyles.extracted16}
              >
                Save
              </button>

              {status && (
                <p className={layoutStyles.extracted17}>{status}</p>
              )}
            </div>
          ) : (
            <p className={layoutStyles.extracted18}>Loading user data...</p>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
