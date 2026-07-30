export const whatsappUrl = (message: string, number: string) => `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
