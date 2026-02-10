// Apple In-App Purchase hook using tauri-plugin-iap
// Handles StoreKit 2 purchases on iOS and verifies with backend

import { useState, useCallback } from 'react';
import { isIOS } from '@utils/platform';
import { Logger } from '@utils/logging';
import { useAuth } from './useAuth';

const LOG_SOURCE = 'APPLE_PAYMENTS';

// Product IDs from App Store Connect (must match backend env vars)
export const APPLE_PRODUCT_IDS = {
  plus: 'com.observer.ai.plus.monthly',
  pro: 'com.observer.ai.pro.monthly',
  max: 'com.observer.ai.max.monthly',
} as const;

export type AppleTier = keyof typeof APPLE_PRODUCT_IDS;

interface AppleProduct {
  productId: string;
  title: string;
  description: string;
  formattedPrice: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
}

interface PurchaseResult {
  success: boolean;
  tier?: string;
  error?: string;
  originalTransactionId?: string;
}

export interface UseApplePaymentsReturn {
  isAppleDevice: boolean;
  isLoading: boolean;
  error: string | null;
  products: AppleProduct[];
  loadProducts: () => Promise<void>;
  purchaseSubscription: (tier: AppleTier) => Promise<PurchaseResult>;
  restorePurchases: () => Promise<PurchaseResult>;
}

// Dynamically import the IAP plugin (only available in Tauri iOS)
async function getIapPlugin() {
  try {
    const iap = await import('@choochmeque/tauri-plugin-iap-api');
    return iap;
  } catch (err) {
    Logger.warn(LOG_SOURCE, 'IAP plugin not available', { error: err });
    return null;
  }
}

export function useApplePayments(): UseApplePaymentsReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<AppleProduct[]>([]);

  const { getAccessToken, isAuthenticated } = useAuth();
  const isAppleDevice = isIOS();

  // Load product information from App Store
  const loadProducts = useCallback(async () => {
    Logger.info(LOG_SOURCE, '=== loadProducts() CALLED ===');

    if (!isAppleDevice) {
      Logger.warn(LOG_SOURCE, 'Not an Apple device, skipping product load');
      return;
    }

    Logger.info(LOG_SOURCE, 'Starting product load for Apple device');
    setIsLoading(true);
    setError(null);

    try {
      Logger.info(LOG_SOURCE, 'Attempting to get IAP plugin...');

      const iap = await getIapPlugin();

      if (!iap) {
        Logger.error(LOG_SOURCE, 'IAP plugin is NULL - plugin not loaded');
        throw new Error('IAP plugin not available');
      }

      Logger.info(LOG_SOURCE, 'IAP plugin loaded successfully');

      const productIds = Object.values(APPLE_PRODUCT_IDS);
      Logger.info(LOG_SOURCE, 'Requesting products from App Store', {
        productIds,
        count: productIds.length,
        type: 'subs'
      });

      const response = await iap.getProducts(productIds, 'subs');

      // DEBUG: Log the full response from StoreKit
      Logger.info(LOG_SOURCE, 'StoreKit getProducts response received', {
        hasResponse: !!response,
        responseType: typeof response,
        responseKeys: response ? Object.keys(response) : [],
        productsCount: response.products?.length || 0,
        fullResponse: JSON.stringify(response)
      });

      // GetProductsResponse has { products: Product[] }
      const productList = response.products || [];

      if (productList.length === 0) {
        Logger.error(LOG_SOURCE, 'No products returned by StoreKit - Check App Store Connect', {
          requestedIds: productIds,
          responseStructure: response,
          possibleIssues: [
            '1. Products not created in App Store Connect',
            '2. Products not approved/Ready to Submit',
            '3. Wrong product IDs',
            '4. Bundle ID mismatch',
            '5. Not signed in with sandbox account'
          ]
        });
      } else {
        Logger.info(LOG_SOURCE, `SUCCESS: Found ${productList.length} products`, {
          products: productList.map(p => ({
            id: p.productId,
            title: p.title,
            price: p.formattedPrice
          }))
        });
      }

      const mappedProducts: AppleProduct[] = productList.map((p) => ({
        productId: p.productId,
        title: p.title,
        description: p.description,
        formattedPrice: p.formattedPrice || '',
        priceAmountMicros: p.priceAmountMicros || 0,
        priceCurrencyCode: p.priceCurrencyCode || '',
      }));

      setProducts(mappedProducts);
      Logger.info(LOG_SOURCE, 'Products loaded and state updated', {
        count: mappedProducts.length,
        productDetails: mappedProducts
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load products';
      Logger.error(LOG_SOURCE, 'EXCEPTION in loadProducts', {
        error: err,
        errorMessage: message,
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        errorStack: err instanceof Error ? err.stack : undefined
      });
      setError(message);
    } finally {
      setIsLoading(false);
      Logger.info(LOG_SOURCE, '=== loadProducts() COMPLETED ===');
    }
  }, [isAppleDevice]);

  // Purchase a subscription tier
  const purchaseSubscription = useCallback(async (tier: AppleTier): Promise<PurchaseResult> => {
    if (!isAppleDevice) {
      return { success: false, error: 'Not an Apple device' };
    }

    if (!isAuthenticated) {
      return { success: false, error: 'Please log in first' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const iap = await getIapPlugin();
      if (!iap) {
        throw new Error('IAP plugin not available');
      }

      const productId = APPLE_PRODUCT_IDS[tier];
      Logger.info(LOG_SOURCE, `Initiating purchase for ${tier}`, { productId });

      // Initiate the StoreKit 2 purchase
      const purchase = await iap.purchase(productId, 'subs');

      Logger.info(LOG_SOURCE, 'Purchase completed, received transaction', {
        productId: purchase.productId,
        purchaseState: purchase.purchaseState,
      });

      // Get the JWS signed transaction for server verification
      const jwsRepresentation = purchase.jwsRepresentation;
      if (!jwsRepresentation) {
        throw new Error('No signed transaction received from Apple');
      }

      // Verify with our backend
      Logger.info(LOG_SOURCE, 'Verifying transaction with backend...');
      const token = await getAccessToken();

      const verifyResponse = await fetch('https://api.observer-ai.com/payments/apple/verify-transaction', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signed_transaction: jwsRepresentation,
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Verification failed: ${verifyResponse.status}`);
      }

      const result = await verifyResponse.json();
      Logger.info(LOG_SOURCE, 'Transaction verified successfully', {
        tier: result.tier,
        transactionId: result.original_transaction_id,
      });

      return {
        success: true,
        tier: result.tier,
        originalTransactionId: result.original_transaction_id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      Logger.error(LOG_SOURCE, 'Purchase failed', {
        error: err,
        tier,
        productId: APPLE_PRODUCT_IDS[tier],
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        errorMessage: message
      });

      // Provide helpful hints for common errors
      let userMessage = message;
      if (message.includes('Product not found') || message.includes('product') || message.includes('invalid')) {
        userMessage = `Product not found. Please ensure:\n1. All 3 products exist in App Store Connect\n2. Products are "Ready to Submit"\n3. Using sandbox test account\n4. Wait 30+ min after creating products\n\nError: ${message}`;
      }

      setError(userMessage);
      return { success: false, error: userMessage };
    } finally {
      setIsLoading(false);
    }
  }, [isAppleDevice, isAuthenticated, getAccessToken]);

  // Restore previous purchases
  const restorePurchases = useCallback(async (): Promise<PurchaseResult> => {
    if (!isAppleDevice) {
      return { success: false, error: 'Not an Apple device' };
    }

    if (!isAuthenticated) {
      return { success: false, error: 'Please log in first' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const iap = await getIapPlugin();
      if (!iap) {
        throw new Error('IAP plugin not available');
      }

      Logger.info(LOG_SOURCE, 'Restoring purchases...');
      const response = await iap.restorePurchases('subs');

      // RestorePurchasesResponse has { purchases: Purchase[] }
      const purchaseList = response.purchases || [];

      if (purchaseList.length === 0) {
        Logger.warn(LOG_SOURCE, 'No purchases found to restore');
        return { success: false, error: 'No purchases found to restore' };
      }

      Logger.info(LOG_SOURCE, 'Found purchases to restore', { count: purchaseList.length });

      // Find the most recent active subscription with a JWS
      const activePurchase = purchaseList.find((p) =>
        p.purchaseState === 1 && // PURCHASED
        p.jwsRepresentation
      );

      if (!activePurchase) {
        Logger.warn(LOG_SOURCE, 'No active subscription found in restored purchases');
        return { success: false, error: 'No active subscription found' };
      }

      // Verify with backend restore endpoint
      Logger.info(LOG_SOURCE, 'Verifying restored purchase with backend...');
      const token = await getAccessToken();

      const restoreResponse = await fetch('https://api.observer-ai.com/payments/apple/restore-purchases', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signed_transaction: activePurchase.jwsRepresentation,
        }),
      });

      if (!restoreResponse.ok) {
        const errorData = await restoreResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Restore failed: ${restoreResponse.status}`);
      }

      const result = await restoreResponse.json();
      Logger.info(LOG_SOURCE, 'Restore verified successfully', {
        tier: result.tier,
        transactionId: result.original_transaction_id,
      });

      return {
        success: true,
        tier: result.tier,
        originalTransactionId: result.original_transaction_id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      Logger.error(LOG_SOURCE, 'Restore failed', { error: err });
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [isAppleDevice, isAuthenticated, getAccessToken]);

  return {
    isAppleDevice,
    isLoading,
    error,
    products,
    loadProducts,
    purchaseSubscription,
    restorePurchases,
  };
}
