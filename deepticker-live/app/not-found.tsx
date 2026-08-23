import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <div className="card" style={{ marginTop: 40 }}>
        <h2 className="sectionTitle">הדף לא נמצא</h2>
        <p className="ruleDesc">
          הכתובת שביקשת אינה קיימת. <Link href="/">חזרה לדף הבית</Link>.
        </p>
      </div>
    </main>
  );
}
