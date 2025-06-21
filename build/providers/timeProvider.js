import * as dotenv from 'dotenv';
import { DateTime, Settings, IANAZone } from 'luxon';
// Load environment variables
dotenv.config();
function getLocalTimezone() {
    // Luxon gets the local system timezone
    return Settings.defaultZone.name;
}
// Helper to validate IANA timezone names (basic check)
function isValidTimezone(tz) {
    // Use Luxon's built-in validator
    return IANAZone.isValidZone(tz);
}
function getCurrentTime(timezoneName) {
    if (!isValidTimezone(timezoneName)) {
        throw new Error(`Invalid timezone: ${timezoneName}`);
    }
    const nowInZone = DateTime.now().setZone(timezoneName);
    return {
        timezone: timezoneName,
        datetime: nowInZone.toISO({ includeOffset: true, suppressMilliseconds: true }) ?? 'Invalid Date',
    };
}
function convertTime(sourceTz, timeStr, targetTz) {
    if (!isValidTimezone(sourceTz)) {
        throw new Error(`Invalid source timezone: ${sourceTz}`);
    }
    if (!isValidTimezone(targetTz)) {
        throw new Error(`Invalid target timezone: ${targetTz}`);
    }
    // Parse time string (HH:mm) using Luxon
    const parsedTime = DateTime.fromFormat(timeStr, 'HH:mm');
    if (!parsedTime.isValid) {
        throw new Error("Invalid time format. Expected HH:MM [24-hour format]");
    }
    // Create DateTime object for source time today in the source timezone
    const sourceDt = DateTime.now()
        .setZone(sourceTz)
        .set({ hour: parsedTime.hour, minute: parsedTime.minute, second: 0, millisecond: 0 });
    // Convert to the target timezone
    const targetDt = sourceDt.setZone(targetTz);
    // Calculate time difference
    // Luxon handles offsets directly. Get difference in minutes and format.
    const offsetDiffMinutes = targetDt.offset - sourceDt.offset;
    const offsetDiffHours = offsetDiffMinutes / 60;
    let timeDiffStr;
    if (Number.isInteger(offsetDiffHours)) {
        timeDiffStr = `${offsetDiffHours >= 0 ? '+' : ''}${offsetDiffHours}h`;
    }
    else {
        // Format fractional hours (e.g., +5.75h for +5:45)
        timeDiffStr = `${offsetDiffHours >= 0 ? '+' : ''}${offsetDiffHours.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}h`;
    }
    return {
        source: {
            timezone: sourceTz,
            datetime: sourceDt.toISO({ includeOffset: true, suppressMilliseconds: true }) ?? 'Invalid Date',
        },
        target: {
            timezone: targetTz,
            datetime: targetDt.toISO({ includeOffset: true, suppressMilliseconds: true }) ?? 'Invalid Date',
        },
        time_difference: timeDiffStr,
    };
}
const localTz = getLocalTimezone();
export class TimeProvider {
    /**
     * Get the tool definitions
     */
    getToolDefinitions() {
        return [
            {
                name: 'get_current_time',
                description: 'Get the current date',
                inputSchema: {
                    type: "object",
                    properties: {
                        timezone: {
                            type: 'string',
                            description: `IANA timezone name (e.g., 'America/New_York', 'Europe/London'). Defaults to server local: ${localTz}`
                        }
                    },
                },
            },
            {
                name: 'convert_time',
                description: 'convert time from one timezone to another',
                inputSchema: {
                    type: "object",
                    properties: {
                        source_timezone: {
                            type: 'string',
                            description: `Source IANA timezone name. Defaults to server local: ${localTz}`,
                        },
                        time: {
                            type: 'string',
                            description: `Time to convert (HH:MM)"`,
                            regex: '/^\d{2}:\d{2}$/',
                        },
                        target_timezone: {
                            type: 'string',
                            description: `Target IANA timezone name. Defaults to server local: ${localTz}`,
                        },
                    },
                    required: ['time'],
                },
            }
        ];
    }
    /**
     * List all available calendars
     */
    async get_current_time(parameters) {
        const effectiveTimezone = parameters.timezone || localTz;
        console.log(`[Server] Handling tool call: get_current_time for timezone='${effectiveTimezone}'`); // Log effective TZ
        try {
            const result = getCurrentTime(effectiveTimezone);
            return result;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * List events in a calendar
     */
    async convert_time(parameters) {
        const effectiveSourceTz = parameters.source_timezone || localTz;
        const effectiveTargetTz = parameters.target_timezone || localTz;
        try {
            const result = convertTime(effectiveSourceTz, parameters.time, effectiveTargetTz);
            // Return result as JSON string in text content
            return result;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
}
