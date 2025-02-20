import { getPerformance } from 'firebase/performance';
import { analytics } from '../firebase/firebase';
import { logEvent } from 'firebase/analytics';

export class PerformanceMonitor {
  static logTiming(category, variable, value) {
    logEvent(analytics, 'timing_complete', {
      name: variable,
      value: Math.round(value),
      category: category
    });
  }

  static logError(error, context) {
    logEvent(analytics, 'error', {
      error_name: error.name,
      error_message: error.message,
      error_context: context
    });
  }

  static logPageView(pageName) {
    logEvent(analytics, 'page_view', {
      page_name: pageName
    });
  }
}