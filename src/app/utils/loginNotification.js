export async function sendLoginNotification(user, method = "password") {
  if (!user?.getIdToken) return;

  try {
    const idToken = await user.getIdToken();
    await fetch("/api/security/login-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ method }),
    });
  } catch (error) {
    console.warn("Login notification failed:", error);
  }
}
