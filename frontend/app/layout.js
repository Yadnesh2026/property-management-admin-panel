import "./globals.css";

export const metadata = {
  title: "Property Management Admin Panel",
  description: "Admin panel for managing flats, rooms, beds, tenants, and occupancy.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
