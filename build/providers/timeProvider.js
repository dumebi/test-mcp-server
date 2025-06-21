import * as chrono from "chrono-node";
import { addDays } from "date-fns/addDays";
import { addMonths } from "date-fns/addMonths";
import { subDays } from "date-fns/subDays";
import * as dotenv from 'dotenv';
// Load environment variables
dotenv.config();
export class TimeRange {
    range;
    constructor(range) {
        this.range = range;
    }
    static parse = (range) => {
        if (typeof range === "object") {
            range = range.time_range;
        }
        if (!range) {
            return undefined;
        }
        const parsed = chrono.parse(range);
        const [chronoRange] = parsed;
        if (!chronoRange) {
            return undefined;
        }
        return new TimeRange(chronoRange);
    };
    get hasAfter() {
        return !!this.getAfter({});
    }
    /**
     * Gets after date in ISO format.
     * @param {ITimeBoundOptions} [options] - Options for time bound calculation
     * @returns {string|undefined}
     */
    getAfter = (options) => {
        if (!this.range.start) {
            return undefined;
        }
        let after = this.range.start.date();
        if (this.range.start.isCertain("hour") && !options?.ignoreTime) {
            return after.toISOString();
        }
        if (options?.exclusive) {
            after = subDays(after, 1);
        }
        return after.toISOString().split("T")[0];
    };
    get hasBefore() {
        return !!this.getBefore({});
    }
    /**
     * Gets the before date in ISO format.
     * @param {ITimeBoundOptions} [options] - Options for time bound calculation
     * @returns {string|undefined}
     */
    getBefore = (options) => {
        let before = this.range.end?.date();
        if (!before &&
            this.range.start?.isCertain("month") &&
            !this.range.start.isCertain("day")) {
            before = subDays(addMonths(this.range.start.date(), 1), 1);
        }
        if (!before) {
            return undefined;
        }
        if (this.range.end?.isCertain("hour") && !options?.ignoreTime) {
            return before.toISOString();
        }
        if (options?.exclusive) {
            before = addDays(before, 1);
        }
        return before.toISOString().split("T")[0];
    };
}
export class TimeProvider {
    /**
     * Get the tool definitions
     */
    getToolDefinitions() {
        return [
            {
                name: 'get_current_date',
                description: 'Get the current date',
                inputSchema: {
                    type: "object",
                    properties: {
                        time_zone: {
                            type: 'string',
                            description: 'The time zone to use for the current time. If not provided, will use the system time zone.',
                            default: 'UTC',
                        }
                    },
                },
            },
            // {
            //   name: 'resolve_time_description',
            //   description: 'Resolve a timestamp or time range from natural language time description',
            //   inputSchema: {
            //     type: "object",
            //     properties: {
            //       time_range: {
            //         type: 'string',
            //         description: 'Text describing the date range to search within, which will be parsed by chrono-node. e.g. "last week", "yesterday", "17 Aug - 19 Aug", etc. If not provided, will search from the beginning of time.',
            //       },
            //     },
            //   },
            // }
        ];
    }
    /**
     * List all available calendars
     */
    async getCurrentDate(parameters) {
        try {
            const now = parameters.time_zone ? new Date().toLocaleString("en-US", { timeZone: parameters.time_zone }) : new Date();
            return { date: now };
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * List events in a calendar
     */
    async resolveTimeDesc(parameters) {
        try {
            const timeRange = TimeRange.parse(parameters);
            if (!timeRange) {
                return parameters.time_range
                    ? "Invalid time range"
                    : "No time range provided";
            }
            return { after: timeRange.getAfter(parameters), before: timeRange.getBefore(parameters) };
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
}
