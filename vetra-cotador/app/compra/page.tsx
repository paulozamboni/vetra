import type { Metadata } from 'next';
import { CheckoutReview } from '@/components/checkout-review';
export const metadata:Metadata={title:'Revise sua compra | Vetra',robots:{index:false,follow:false}};
export default function CheckoutPage(){return <CheckoutReview/>;}
