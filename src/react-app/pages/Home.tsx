import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  HolidayFeedSchema,
  type HolidayEntry,
  type HolidayFeed,
} from "@/shared/types";

// Reference date: November 23, 2025 is the starting point
const REFERENCE_DATE = new Date(2025, 10, 23); // Month is 0-indexed

// Pattern repeats every 4 weeks
// Week pattern (Sun, Mon, Tue, Wed, Thu):
const PATTERN = [
  ["A", "A", "B", "B", "A"], // Week 0
  ["A", "B", "B", "A", "A"], // Week 1
  ["B", "B", "A", "A", "B"], // Week 2
  ["B", "A", "A", "B", "B"], // Week 3
];

const MONTHLY_OFFICE_TARGET = 10;
const ATTENDANCE_STORAGE_KEY = "office-attendance-days";
const HOLIDAY_FEED_URL = `${import.meta.env.BASE_URL}holidays.json`;
const CAIRO_TIME_OFFSET_MS = 2 * 60 * 60 * 1000;

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const loadAttendance = () => {
  if (typeof window === "undefined") {
    return {} as Record<string, boolean>;
  }

  try {
    const stored = window.localStorage.getItem(ATTENDANCE_STORAGE_KEY);

    if (!stored) {
      return {} as Record<string, boolean>;
    }

    const parsed = JSON.parse(stored);

    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {} as Record<string, boolean>;
  }
};

const formatHolidayUpdate = (value: string | null) => {
  if (!value) {
    return "Waiting for holiday feed";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Holiday feed date unavailable";
  }

  const cairoDate = new Date(parsedDate.getTime() + CAIRO_TIME_OFFSET_MS);

  return `${cairoDate.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC+2`;
};

export default function HomePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendance, setAttendance] = useState<Record<string, boolean>>(() =>
    loadAttendance()
  );
  const [holidayFeed, setHolidayFeed] = useState<HolidayFeed | null>(null);
  const [isHolidayFeedLoading, setIsHolidayFeedLoading] = useState(true);
  const [holidayFeedError, setHolidayFeedError] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const holidaysByDate = useMemo<Record<string, HolidayEntry[]>>(() => {
    return (holidayFeed?.holidays ?? []).reduce<Record<string, HolidayEntry[]>>(
      (lookup, holiday) => {
        if (!lookup[holiday.date]) {
          lookup[holiday.date] = [];
        }

        lookup[holiday.date].push(holiday);
        return lookup;
      },
      {}
    );
  }, [holidayFeed]);

  const holidayFeedUpdatedLabel = useMemo(
    () => formatHolidayUpdate(holidayFeed?.last_updated ?? null),
    [holidayFeed?.last_updated]
  );

  const holidayDaysLoaded = holidayFeed?.holidays.length ?? 0;

  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

  // Calculate week index from reference date
  const getWeekIndex = (date: Date): number => {
    const diffTime = date.getTime() - REFERENCE_DATE.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weeksSinceReference = Math.floor(diffDays / 7);
    return ((weeksSinceReference % 4) + 4) % 4; // Ensure positive modulo
  };

  // Get group for a specific date
  const getGroup = (date: Date): "A" | "B" | null => {
    const dayOfWeek = date.getDay();
    
    // Friday (5) and Saturday (6) are ignored
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      return null;
    }

    const weekIndex = getWeekIndex(date);
    const dayIndex = dayOfWeek; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu
    
    return PATTERN[weekIndex][dayIndex] as "A" | "B";
  };

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  useEffect(() => {
    window.localStorage.setItem(
      ATTENDANCE_STORAGE_KEY,
      JSON.stringify(attendance)
    );
  }, [attendance]);

  useEffect(() => {
    const controller = new AbortController();

    const loadHolidayFeed = async () => {
      try {
        setIsHolidayFeedLoading(true);
        setHolidayFeedError(null);

        const response = await fetch(HOLIDAY_FEED_URL, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Holiday feed request failed with ${response.status}`);
        }

        const payload = HolidayFeedSchema.parse(await response.json());
        setHolidayFeed(payload);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHolidayFeedError(
          error instanceof Error
            ? error.message
            : "Holiday feed could not be loaded."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsHolidayFeedLoading(false);
        }
      }
    };

    void loadHolidayFeed();

    return () => {
      controller.abort();
    };
  }, []);

  const isSelectableDay = (date: Date) => {
    const dayOfWeek = date.getDay();
    return dayOfWeek !== 5 && dayOfWeek !== 6;
  };

  const toggleAttendance = (date: Date) => {
    if (!isSelectableDay(date)) {
      return;
    }

    const key = getDateKey(date);
    const isCurrentlyAttended = Boolean(attendance[key]);

    if (isCurrentlyAttended) {
      const formattedDate = date.toLocaleDateString("default", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      const shouldRemove = window.confirm(
        `Remove attendance for ${formattedDate}?`
      );

      if (!shouldRemove) {
        return;
      }
    }

    setAttendance((currentAttendance) => {
      if (currentAttendance[key]) {
        const nextAttendance = { ...currentAttendance };
        delete nextAttendance[key];
        return nextAttendance;
      }

      return {
        ...currentAttendance,
        [key]: true,
      };
    });
  };

  const attendedDaysThisMonth = Object.keys(attendance).filter((dateKey) => {
    const [entryYear, entryMonth] = dateKey.split("-");
    return Number(entryYear) === year && Number(entryMonth) === month + 1;
  }).length;

  const weekdayHolidayCountThisMonth = Object.keys(holidaysByDate).filter(
    (dateKey) => {
      const [entryYear, entryMonth, entryDay] = dateKey.split("-");

      if (
        Number(entryYear) !== year ||
        Number(entryMonth) !== month + 1
      ) {
        return false;
      }

      const dayOfWeek = new Date(
        Number(entryYear),
        Number(entryMonth) - 1,
        Number(entryDay)
      ).getDay();

      return dayOfWeek !== 5 && dayOfWeek !== 6;
    }
  ).length;

  const adjustedMonthlyOfficeTarget = Math.max(
    0,
    MONTHLY_OFFICE_TARGET - weekdayHolidayCountThisMonth
  );

  const remainingOfficeDays = Math.max(
    0,
    adjustedMonthlyOfficeTarget - attendedDaysThisMonth
  );

  // Build calendar grid
  const calendarDays = [];
  
  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="aspect-square" />);
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateKey = getDateKey(date);
    const group = getGroup(date);
    const holidays = holidaysByDate[dateKey] ?? [];
    const holidayNames = holidays.map((holiday) => holiday.name).join(" • ");
    const isHoliday = holidays.length > 0;
    const dayOfWeek = date.getDay();
    const isSelectable = isSelectableDay(date);
    const isAttended = Boolean(attendance[dateKey]);
    const isToday = 
      date.getDate() === new Date().getDate() &&
      date.getMonth() === new Date().getMonth() &&
      date.getFullYear() === new Date().getFullYear();

    let bgColor = "bg-gray-50";
    let textColor = "text-gray-900";
    let borderColor = "border-transparent";
    
    if (isHoliday) {
      bgColor = "bg-amber-100 hover:bg-amber-200";
      textColor = "text-amber-950";
      borderColor = "border-amber-300";
    } else if (dayOfWeek === 5 || dayOfWeek === 6) {
      // Weekends - gray
      bgColor = "bg-gray-200";
      textColor = "text-gray-500";
    } else if (group === "A") {
      bgColor = "bg-red-100 hover:bg-red-200";
      textColor = "text-red-900";
    } else if (group === "B") {
      bgColor = "bg-blue-100 hover:bg-blue-200";
      textColor = "text-blue-900";
    }

    if (isAttended) {
      borderColor = "border-emerald-500";
      bgColor =
        isHoliday
          ? "bg-amber-200 hover:bg-amber-300"
          : group === "A"
          ? "bg-red-200 hover:bg-red-300"
          : "bg-blue-200 hover:bg-blue-300";
    }

    const ariaLabel = [
      date.toLocaleDateString("default", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      isHoliday ? `Holiday: ${holidayNames}` : null,
      group ? `Group ${group}` : "Weekend",
      isAttended
        ? "Marked attended"
        : isSelectable
          ? "Selectable day"
          : "Not selectable",
    ]
      .filter(Boolean)
      .join(", ");

    calendarDays.push(
      <button
        type="button"
        key={day}
        onClick={() => toggleAttendance(date)}
        disabled={!isSelectable}
        aria-pressed={isAttended}
        aria-label={ariaLabel}
        title={isHoliday ? holidayNames : undefined}
        className={`aspect-square rounded-lg border-2 p-2 text-left transition-all ${bgColor} ${textColor} ${borderColor} ${
          isSelectable ? "cursor-pointer" : "cursor-not-allowed"
        } ${isToday ? "ring-2 ring-gray-900 ring-offset-2" : ""}`}
      >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{day}</div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {isHoliday && (
                  <span className="hidden rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 lg:inline-flex">
                    Holiday
                  </span>
                )}
                {isAttended && (
                  <span className="hidden rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-800 lg:inline-flex">
                    Attended
                  </span>
                )}
              </div>
            </div>
            {isHoliday && (
              <div className="mt-2 hidden text-[11px] font-semibold leading-4 text-amber-950 lg:block">
                {holidayNames}
              </div>
            )}
            {group && (
              <div className="mt-1 hidden text-xs font-semibold lg:block">
                Group {group}
              </div>
            )}
            {!isSelectable && !isHoliday && (
              <div className="mt-auto hidden pt-2 text-[11px] font-medium text-gray-600 lg:block">
                Weekend
              </div>
            )}
            {isHoliday && (
              <div className="mt-auto hidden pt-2 text-[11px] font-medium text-amber-800 lg:block">
                Holiday
              </div>
            )}
          </div>
        </button>
      );
    }

  const monthName = firstDay.toLocaleString("default", { month: "long" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Groups Calendar
          </h1>
          <p className="text-gray-600">
            Schedule for Group A and Group B
          </p>
        </div>

        {/* Calendar Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-emerald-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Monthly goal
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-950">
                {adjustedMonthlyOfficeTarget} days
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Attended
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {attendedDaysThisMonth}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-100 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
                Remaining this month
              </p>
              <p className="mt-2 text-3xl font-bold text-amber-950">
                {remainingOfficeDays}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-100 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-600">
                Holiday feed
              </p>
              <p className="mt-2 text-base font-semibold text-stone-900">
                {isHolidayFeedLoading
                  ? "Refreshing..."
                  : holidayFeedError
                    ? "Unavailable"
                    : `${holidayDaysLoaded} days loaded`}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Last holiday update: {holidayFeedUpdatedLabel}
              </p>
              {holidayFeedError && (
                <p className="mt-2 text-xs font-medium text-rose-700">
                  {holidayFeedError}
                </p>
              )}
            </div>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={previousMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-gray-700" />
            </button>
            
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-gray-900">
                {monthName} {year}
              </h2>
              <button
                onClick={goToToday}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Today
              </button>
            </div>

            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-6 h-6 text-gray-700" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-4 mb-4">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="text-center text-sm font-semibold text-gray-600"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-4">{calendarDays}</div>

          {/* Legend */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-6">
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-6 w-6 shrink-0 rounded border-2 border-red-300 bg-red-100" />
                <span className="text-sm font-medium text-gray-700">
                  Group A
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-6 w-6 shrink-0 rounded border-2 border-blue-300 bg-blue-100" />
                <span className="text-sm font-medium text-gray-700">
                  Group B
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-6 w-6 shrink-0 rounded border-2 border-gray-400 bg-gray-200" />
                <span className="text-sm font-medium text-gray-700">
                  Weekend (ignored)
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-6 w-6 shrink-0 rounded border-2 border-amber-300 bg-amber-100" />
                <span className="text-sm font-medium text-gray-700">
                  Holiday
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-6 w-6 shrink-0 rounded border-2 border-emerald-500 bg-white" />
                <span className="text-sm font-medium text-gray-700">
                  Marked attended
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-4">
              Click Sunday-Thursday and weekday holiday dates to save office attendance in this browser. The monthly target starts at 10 days and drops by 1 for each Sunday-Thursday holiday.
            </p>
            <p className="text-xs text-gray-500 text-center mt-2">
              Reference date: November 23, 2025 • Pattern repeats every 4 weeks
            </p>
            <p className="text-xs text-gray-500 text-center mt-2">
              Holiday data loads from the daily `gh-pages` feed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
