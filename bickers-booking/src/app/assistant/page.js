"use client";
import { useState } from "react";

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ask = async () => {
    setLoading(true);
    setError("");
    setResponse("");

    try {
      const res = await fetch("/api/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Something went wrong");
      }

      const data = await res.json();
      setResponse(data.reply);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>ChatGPT Assistant</h1>

      <textarea
        rows={5}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask something..."
        style={{ width: "100%", marginBottom: 10 }}
      />

      <button onClick={ask} style={{ padding: "10px 20px" }} disabled={loading}>
        {loading ? "Asking..." : "Ask"}
      </button>

      {error && (
        <p style={{ color: "red", marginTop: 20 }}>
          <strong>Error:</strong> {error}
        </p>
      )}

      {response && (
        <div style={{ marginTop: 20 }}>
          <strong>Response:</strong>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}
