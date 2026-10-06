import type { Metadata } from "next";
import Home from "@/app/page";
export const metadata: Metadata = { title: "Compare seu seguro viagem | Vetra", description: "Compare as opções de seguro viagem e revise os dados da sua cotação.", robots: { index: false, follow: false } };
export default function ResultsPage() { return <Home resultsMode />; }
