import { Client, auth } from "twitter-api-sdk";
import { ApiRequestError, TweetV2, TweetV2PaginableTimelineResult, TwitterApi, UserV2, ListV2, InlineErrorV2, EUploadMimeType } from 'twitter-api-v2';

/**
 * Twitter service for interacting with the Twitter API
 */

export interface GetTokenResponse {
  refresh_token?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_at: number;
}

export enum TwitterOAuth2Scopes {
  TWEET_READ = "tweet.read",
  TWEET_WRITE = "tweet.write",
  TWEET_MODERATE_WRITE = "tweet.moderate.write",
  USERS_READ = "users.read",
  FOLLOWS_READ = "follows.read",
  FOLLOWS_WRITE = "follows.write",
  OFFLINE_ACCESS = "offline.access",
  SPACE_READ = "space.read",
  MUTE_READ = "mute.read",
  MUTE_WRITE = "mute.write",
  LIKE_READ = "like.read",
  LIKE_WRITE = "like.write",
  LIST_READ = "list.read",
  LIST_WRITE = "list.write",
  BLOCK_READ = "block.read",
  BLOCK_WRITE = "block.write",
  BOOKMARK_READ = "bookmark.read",
  BOOKMARK_WRITE = "bookmark.write",
} 

export class TwitterService {
  private static instance: TwitterService;
  private client: Client | null = null;
  private authClient: auth.OAuth2User

  /**
   * Private constructor to enforce singleton pattern
   */
  constructor() {
    this.authClient = new auth.OAuth2User({
      client_id: process.env.TWITTER_CLIENT_ID || "",
      client_secret: process.env.TWITTER_CLIENT_SECRET || "",
      callback: process.env.TWITTER_REDIRECT_URI || "",
      scopes: ["tweet.read", "tweet.write", "users.read"],
    });
  }

  async getAuthUrl(scopes?: TwitterOAuth2Scopes[], state: Record<string, string> = {}) {
    const stateString = JSON.stringify(state);
    const allScopes = scopes || []

    const client = new auth.OAuth2User({
      client_id: process.env.TWITTER_CLIENT_ID || "",
      client_secret: process.env.TWITTER_CLIENT_SECRET || "",
      callback: process.env.TWITTER_REDIRECT_URI || "",
      scopes: [...allScopes, "offline.access"],
    });


    const url = client.generateAuthURL({
      state: Buffer.from(stateString).toString("base64"),
      code_challenge_method: "plain",
      code_challenge: "challenge",
    });

    return url;
  }

  async getToken(code: string) {
    this.authClient.generateAuthURL({
      state: "challenge",
      code_challenge_method: 'plain',
      code_challenge: "challenge",
    });
    const { token } = await this.authClient.requestAccessToken(code);
    return token as GetTokenResponse;
  }

  /**
   * Get the singleton instance of TwitterService
   */
  public static getInstance(): TwitterService {
    if (!TwitterService.instance) {
      TwitterService.instance = new TwitterService();
    }
    return TwitterService.instance;
  }

  /**
   * Initialize the Twitter client with credentials
   * @returns The initialized Twitter client
   */
  public getClient(): Client {
    if (!this.client) {
      if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_KEY_SECRET || 
          !process.env.TWITTER_ACCESS_TOKEN) {
        throw new Error('Twitter credentials are not properly configured in environment variables');
      }
      
    //   this.client = new TwitterApi({
    //     appKey: process.env.TWITTER_API_KEY,
    //     appSecret: process.env.TWITTER_API_KEY_SECRET,
    //     accessToken: process.env.TWITTER_ACCESS_TOKEN
    // });

    const allScopes = Object.values(TwitterOAuth2Scopes)

    const client = new auth.OAuth2User({
      client_id: process.env.TWITTER_CLIENT_ID || "",
      client_secret: process.env.TWITTER_CLIENT_SECRET || "",
      callback: process.env.TWITTER_REDIRECT_URI || "",
      scopes: [...allScopes, "offline.access"],
    });

    this.client = new Client(client)
     console.log('Twitter client initialized successfully', this.client);
    }
    return this.client;
  }

  /**
   * Get tweets for a specific user
   * @param userId The Twitter user ID
   * @param paginationToken Optional pagination token for fetching next page
   * @returns Promise resolving to user timeline data
   */
  public async getUserTweets(userId: string, paginationToken?: string, exclude?: ('retweets' | 'replies')[], maxResults?: number): Promise<TweetV2[] | InlineErrorV2[] | ApiRequestError | string> {
    try {
      const client = this.getClient();
      const tweets = await client.tweets.usersIdTweets(userId, {
        exclude: exclude ?? ["retweets", "replies"],
        max_results: maxResults || 10,
        pagination_token: paginationToken,
      });
      // const tweets = await client.v2.userTimeline(userId, {
      //   exclude: exclude ?? ["retweets", "replies"],
      //   max_results: 50,
      //   pagination_token: paginationToken,
      // });

      return JSON.stringify({
        result: tweets.data,
        message: "Tweets fetched successfully",
      });
    } catch (error: any) {
      // Convert error to a string representation to avoid serialization issues
      const errorMessage = error;
      console.error('Error fetching tweets:', errorMessage);
      return error;
    }
  }

  /**
   * Get a single tweet by ID
   * @param tweetId The ID of the tweet to retrieve
   * @returns Promise resolving to the tweet data or null if not found
   */
  public async getTweet(tweetId: string): Promise<TweetV2 | ApiRequestError> {
    try {
      const client = this.getClient();
      const result = await client.tweets.findTweetById(tweetId);
      // const result = await client.v2.singleTweet(tweetId);
      if (result.data) {
        // Fix geo.coordinates type if present
        if (result.data && result.data.geo && result.data.geo.coordinates) {
          const coords = result.data.geo.coordinates;
          // Ensure coordinates is [number, number] | null
          (result.data.geo as any).coordinates = {
            type: coords.type,
            coordinates: Array.isArray(coords.coordinates) && coords.coordinates.length === 2
              ? [coords.coordinates[0], coords.coordinates[1]]
              : null
          };
        }
        return result.data as TweetV2;
      } else {
        return {
          title: "Not Found",
          detail: "Tweet not found",
          type: "about:blank",
          status: 404
        } as unknown as ApiRequestError;
      }
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Get mentions for a specific user
   * @param userId The Twitter user ID
   * @param paginationToken Optional pagination token for fetching next page
   * @param maxResults Optional parameter to specify the number of results to return (default: 10)
   * @returns Promise resolving to user mention timeline data
   */
  public async getUserMentionTimeline(userId: string, paginationToken?: string, maxResults?: number): Promise<Object> {
    try {
      const client = this.getClient();
      const mentions = await client.tweets.usersIdMentions(userId, {
        max_results: maxResults || 10,
        pagination_token: paginationToken,
      });
      // const mentions = await client.v2.userMentionTimeline(userId, {
      //   max_results: maxResults || 10,
      //   pagination_token: paginationToken,
      // });
      return mentions.data ?? {};
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Quote a tweet with a comment
   * @param tweetId The ID of the tweet to quote
   * @param replyText The text to include with the quote
   * @returns Promise resolving to the created quote tweet data or error
   */
  public async quoteAndComment(tweetId: string, replyText: string): Promise<any> {
    try {
      const client = this.getClient();
      const result = await client.tweets.createTweet({
        text: replyText,
        quote_tweet_id: tweetId, // Use quote_tweet_id to create a quote tweet
      });
      // const reply = await client.v2.reply(replyText, tweetId);
      // const quote = await client.v2.quote(replyText, tweetId);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Reply to a tweet
   * @param tweetId The ID of the tweet to reply to
   * @param replyText The text content of the reply
   * @returns Promise resolving to the created reply tweet data or error
   */
  public async replyToTweet(tweetId: string, replyText: string): Promise<any> {
    try {
      const client = this.getClient();
      const result = await client.tweets.createTweet({
        text: replyText,
        reply: {
          in_reply_to_tweet_id: tweetId,
          exclude_reply_user_ids: [], // Optional: specify user IDs to exclude from the reply
        }
      });
      // const reply = await client.v2.reply(replyText, tweetId);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Post a new tweet, optionally with an image
   * @param text The text content of the tweet
   * @param imageBase64 Optional base64 encoded image to attach to the tweet
   * @returns Promise resolving to the created tweet data or error
   */
  public async postTweet(text: string, imageBase64?: string): Promise<any> {
    try {
      const client = this.getClient();
      if (!text || text.length === 0) {
        throw new Error("Tweet text cannot be empty");
      }
      if (imageBase64) {
        // Convert base64 to buffer
        const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        
        // Determine image type from base64 string
        let mimeType = EUploadMimeType.Jpeg;
        if (imageBase64.includes('data:image/png')) {
          mimeType = EUploadMimeType.Png;
        } else if (imageBase64.includes('data:image/gif')) {
          mimeType = EUploadMimeType.Gif;
        } else if (imageBase64.includes('data:image/webp')) {
          mimeType = EUploadMimeType.Webp;
        }
        
        // Upload the media
        // const mediaId = await client.v2.uploadMedia(buffer, {
        //   media_type: mimeType,
        //   media_category: 'tweet_image'
        // });

        const tweet = await client.tweets.createTweet({
          text,
        })
        
        // Post tweet with media
        // const tweet = await client.v2.tweet({
        //   text,
        //   media: {
        //     media_ids: [mediaId]
        //   }
        // });
        
        return tweet.data;
      } else {
        // Post text-only tweet
        const tweet = await client.tweets.createTweet({
          text,
        })
        return tweet.data;
      }
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Like a tweet with the authenticated user
   * @param tweetId The ID of the tweet to like
   * @returns Promise resolving to the like response data or error
   */
  public async likeTweet(tweetId: string): Promise<any> {
    try {
      const client = this.getClient();
      const me = await client.users.findMyUser();
      if (!me.data?.id) {
        throw new Error("Authenticated user ID not found.");
      }
      const result = await client.tweets.usersIdLike(me.data.id, {
        tweet_id: tweetId,
      });
      // First get the authenticated user's ID
      // const me = await client.v2.me();
      // const result = await client.v2.like(me.data.id, tweetId);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Follow a user
   * @param targetUserId The ID of the user to follow
   * @returns Promise resolving to the follow response data or error
   */
  public async followUser(targetUserId: string): Promise<any> {
    try {
      const client = this.getClient();
      const me = await client.users.findMyUser();
      if (!me.data?.id) {
        throw new Error("Authenticated user ID not found.");
      }
      const result = await client.users.usersIdFollow(me.data.id, {
         target_user_id: targetUserId,
      });
      // const me = await client.v2.me();
      // const result = await client.v2.follow(me.data.id, targetUserId);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Unfollow a user
   * @param targetUserId The ID of the user to unfollow
   * @returns Promise resolving to the unfollow response data or error
   */
  public async unfollowUser(targetUserId: string): Promise<any> {
    try {
      const client = this.getClient();
      const me = await client.users.findMyUser();
      if (!me.data?.id) {
        throw new Error("Authenticated user ID not found.");
      }
      const result = await client.users.usersIdUnfollow(me.data.id, targetUserId);
      // const me = await client.v2.me();
      // const result = await client.v2.unfollow(me.data.id, targetUserId);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Get user information by username
   * @param username The Twitter username (without @ symbol)
   * @returns Promise resolving to the user data or error
   */
  public async getUserByUsername(username: string): Promise<any> {
    try {
      const client = this.getClient();
      const result = await client.users.findUserByUsername(username);
      // const result = await client.v2.userByUsername(username);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Search tweets with a query
   * @param query The search query
   * @param maxResults Maximum number of results to return (default: 10)
   * @returns Promise resolving to an array of tweets or error
   */
  public async searchTweets(query: string, maxResults: number = 10): Promise<any> {
    try {
      const client = this.getClient();
      const result = await client.tweets.tweetsFullarchiveSearch({
        query,
        max_results: maxResults,
      });
      // const result = await client.v2.search(query, {
      //   max_results: maxResults,
      // });
      return result.data ?? [];
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  // /**
  //  * Get trending topics for a specific location
  //  * @param woeid The "Where On Earth ID" (WOEID) for the location (e.g., 1 for worldwide)
  //  * @returns Promise resolving to trending topics or error
  //  */
  // public async getTrendingTopics(woeid: number = 1): Promise<any | ApiRequestError> {
  //   try {
  //     const client = this.getClient();
  //     const result = await client.tweets.
  //     const result = await client.v1.trendsAvailable();
  //     return result;
  //   } catch (error: unknown) {
  //     // @ts-ignore
  //     return error;
  //   }
  // }

  /**
   * Create a new list
   * @param name The name of the list
   * @param description Optional description for the list
   * @param isPrivate Whether the list should be private (default: false)
   * @returns Promise resolving to the created list data or error
   */
  public async createList(name: string, description?: string, isPrivate: boolean = false): Promise<any> {
    try {
      const client = this.getClient();
      const result = await client.lists.listIdCreate({
        name,
        description,
        private: isPrivate,
      })
      // const result = await client.v2.createList({
      //   name,
      //   description,
      //   private: isPrivate,
      // });
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Add a member to a list
   * @param listId The ID of the list
   * @param userId The ID of the user to add
   * @returns Promise resolving to the response data or error
   */
  public async addListMember(listId: string, userId: string): Promise<any> {
    try {
      const client = this.getClient();
      const result = await client.lists.listAddMember(listId, {
        user_id: userId,
      });
      // const result = await client.v2.addListMember(listId, userId);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Remove a member from a list
   * @param listId The ID of the list
   * @param userId The ID of the user to remove
   * @returns Promise resolving to the response data or error
   */
  public async removeListMember(listId: string, userId: string): Promise<any> {
    try {
      const client = this.getClient();
      const result = await client.lists.listRemoveMember(listId, userId);
      // const result = await client.v2.removeListMember(listId, userId);
      return result.data;
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }

  /**
   * Get lists owned by the authenticated user
   * @returns Promise resolving to an array of lists or error
   */
  public async getOwnedLists(): Promise<any> {
    try {
      const client = this.getClient();
      const me = await client.users.findMyUser();
      if (!me.data?.id) {
        throw new Error("Authenticated user ID not found.");
      }
      const result = await client.lists.listUserOwnedLists(me.data.id);
      // const result = await client.v2.listsOwned(me.data.id);
      return result.data || [];
    } catch (error: unknown) {
      // @ts-ignore
      return error;
    }
  }
}
