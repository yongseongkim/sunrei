export interface TokenResponse {
  id_token: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export class GoogleOAuthPopup {
  private clientId: string;

  constructor() {
    this.clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
  }

  async signIn(): Promise<TokenResponse> {
    if (!this.clientId) {
      throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set');
    }

    return new Promise((resolve, reject) => {
      // Load Google GIS script dynamically if not already loaded
      if (!window.google?.accounts) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          this.waitForGIS().then(() => this.initializeTokenClient(resolve, reject))
            .catch(() => reject(new Error('Google Identity Services failed to load')));
        };
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
      } else {
        this.initializeTokenClient(resolve, reject);
      }
    });
  }

  private async waitForGIS(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      if (window.google?.accounts?.oauth2) {
        return;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Google Identity Services timeout');
  }

  private initializeTokenClient(
    resolve: (value: TokenResponse) => void,
    reject: (reason: Error) => void
  ) {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: 'openid email profile',
      callback: (response: TokenResponse) => {
        if (response.access_token) {
          resolve(response);
        } else if (response.error) {
          reject(new Error(response.error || 'Authentication failed'));
        }
      },
      error_callback: (error: any) => {
        reject(new Error(error.error || 'Google sign-in failed'));
      },
    });

    tokenClient.requestAccessToken();
  }

  async signOut(): Promise<void> {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('user');
  }
}

export const googleOAuthPopup = new GoogleOAuthPopup();

declare global {
  interface Window {
    google: any;
  }
}
