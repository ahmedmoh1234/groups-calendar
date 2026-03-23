import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

export default function HomePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendance, setAttendance] = useState<Record<string, boolean>>(() =>
    loadAttendance()
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

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

  const isSelectableDay = (date: Date) => {
    const dayOfWeek = date.getDay();
    return dayOfWeek !== 5 && dayOfWeek !== 6;
  };

  const toggleAttendance = (date: Date) => {
    if (!isSelectableDay(date)) {
      return;
    }

    const key = getDateKey(date);

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

  const remainingOfficeDays = Math.max(
    0,
    MONTHLY_OFFICE_TARGET - attendedDaysThisMonth
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
    
    if (dayOfWeek === 5 || dayOfWeek === 6) {
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
        group === "A"
          ? "bg-red-200 hover:bg-red-300"
          : "bg-blue-200 hover:bg-blue-300";
    }

    calendarDays.push(
      <button
        type="button"
        key={day}
        onClick={() => toggleAttendance(date)}
        disabled={!isSelectable}
        aria-pressed={isAttended}
        className={`aspect-square rounded-lg border-2 p-2 text-left transition-all ${bgColor} ${textColor} ${borderColor} ${
          isSelectable ? "cursor-pointer" : "cursor-not-allowed"
        } ${isToday ? "ring-2 ring-gray-900 ring-offset-2" : ""}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium">{day}</div>
            {isAttended && (
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-800">
                Attended
              </span>
            )}
          </div>
        {group && (
            <div className="mt-1 text-xs font-semibold">Group {group}</div>
          )}
          <div className="mt-auto pt-2 text-[11px] font-medium text-gray-600">
            {isSelectable
              ? isAttended
                ? "Office day saved"
                : "Click to mark office"
              : "Weekend"}
          </div>
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
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Monthly goal
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-950">
                {MONTHLY_OFFICE_TARGET} days
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
            <div className="flex items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-red-100 rounded border-2 border-red-300" />
                <span className="text-sm font-medium text-gray-700">
                  Group A
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-100 rounded border-2 border-blue-300" />
                <span className="text-sm font-medium text-gray-700">
                  Group B
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gray-200 rounded border-2 border-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  Weekend (ignored)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-white rounded border-2 border-emerald-500" />
                <span className="text-sm font-medium text-gray-700">
                  Marked attended
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-4">
              Click Sunday-Thursday to save office attendance in this browser. The 10-day target resets automatically each month.
            </p>
            <p className="text-xs text-gray-500 text-center mt-2">
              Reference date: November 23, 2025 • Pattern repeats every 4 weeks
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
