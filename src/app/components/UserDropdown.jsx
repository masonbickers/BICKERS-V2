"use client";

import layoutStyles from "./UserDropdown.styles.module.css";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UserDropdown({ name = "Mason Bickers", email = "masonbickers8@icloud.com" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className={layoutStyles.extracted1}>
      <div
        onClick={() => setOpen(!open)}
        className={layoutStyles.extracted2}
      >
        M
      </div>

      {open && (
        <div className={layoutStyles.extracted3}>
          <div className={layoutStyles.extracted4}>
            <div className={layoutStyles.extracted5}>{name}</div>
            <div className={layoutStyles.extracted6}>{email}</div>
          </div>
          <div className={layoutStyles.extracted7}>Settings</div>
          <div className={layoutStyles.extracted8} onClick={() => router.push("/profile")}>Profile</div>
          <div className={layoutStyles.extracted9} onClick={() => router.push("/login")}>Log out</div>
        </div>
      )}
    </div>
  );
}
