"use client";

import { useState } from "react";
import axios from "axios";

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    try {
      await axios.post("/api/support-tickets", {
        subject,
        message,
      });

      alert("Ticket submitted!");
      setSubject("");
      setMessage("");
    } catch (err) {
      alert("Error submitting ticket");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Support</h2>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <textarea
          placeholder="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button type="submit">Submit</button>
      </form>
    </div>
  );
}
