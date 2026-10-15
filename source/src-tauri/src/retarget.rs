use rustsmf_retarget_core::{analyze_v1, AnalysisInputV1, AnalysisResultV1};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{command, State, Window};

#[derive(Default)]
pub struct RetargetPreflightJobs(Mutex<HashMap<String, (u64, Arc<AtomicBool>)>>);

impl RetargetPreflightJobs {
    fn begin(&self, window: &str, job_id: u64) -> Result<Arc<AtomicBool>, String> {
        let mut jobs = self
            .0
            .lock()
            .map_err(|_| "Retarget preflight job lock is poisoned".to_string())?;
        if let Some((_, previous)) = jobs.remove(window) {
            previous.store(true, Ordering::Release);
        }
        let cancellation = Arc::new(AtomicBool::new(false));
        jobs.insert(window.to_owned(), (job_id, Arc::clone(&cancellation)));
        Ok(cancellation)
    }

    fn cancel(&self, window: &str, job_id: u64) -> Result<bool, String> {
        let jobs = self
            .0
            .lock()
            .map_err(|_| "Retarget preflight job lock is poisoned".to_string())?;
        if let Some((active_id, cancellation)) = jobs.get(window) {
            if *active_id == job_id {
                cancellation.store(true, Ordering::Release);
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn finish(
        &self,
        window: &str,
        job_id: u64,
        cancellation: &Arc<AtomicBool>,
    ) -> Result<bool, String> {
        let mut jobs = self
            .0
            .lock()
            .map_err(|_| "Retarget preflight job lock is poisoned".to_string())?;
        if jobs.get(window).is_some_and(|(active_id, active_token)| {
            *active_id == job_id && Arc::ptr_eq(active_token, cancellation)
        }) {
            jobs.remove(window);
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

#[command]
pub async fn retarget_preflight_v1(
    window: Window,
    jobs: State<'_, RetargetPreflightJobs>,
    job_id: u64,
    input: AnalysisInputV1,
) -> Result<AnalysisResultV1, String> {
    let label = window.label().to_owned();
    let cancellation = jobs.begin(&label, job_id)?;
    let task_cancellation = Arc::clone(&cancellation);
    let task_result = tauri::async_runtime::spawn_blocking(move || {
        analyze_v1(&input, || task_cancellation.load(Ordering::Acquire))
    })
    .await;
    let still_current = jobs.finish(&label, job_id, &cancellation)?;
    if !still_current {
        return Err("RETARGET_JOB_SUPERSEDED: a newer analysis replaced this job".into());
    }
    let result =
        task_result.map_err(|error| format!("Retarget preflight worker failed: {error}"))?;
    match result {
        Ok(value) => Ok(value),
        Err(rustsmf_retarget_core::AnalysisError::Cancelled) => {
            Err("RETARGET_JOB_CANCELLED: preflight analysis was cancelled".into())
        }
        Err(rustsmf_retarget_core::AnalysisError::InvalidInput) => Err(
            "RETARGET_INPUT_INVALID: skeleton or clip snapshot is invalid or exceeds its limit"
                .into(),
        ),
    }
}

#[command]
pub fn cancel_retarget_preflight_v1(
    window: Window,
    jobs: State<'_, RetargetPreflightJobs>,
    job_id: u64,
) -> Result<bool, String> {
    jobs.cancel(window.label(), job_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacement_cancels_previous_job_and_stale_finish_cannot_clear_current() {
        let jobs = RetargetPreflightJobs::default();
        let old = jobs.begin("main", 10).unwrap();
        let current = jobs.begin("main", 11).unwrap();
        assert!(old.load(Ordering::Acquire));
        assert!(!current.load(Ordering::Acquire));
        assert!(!jobs.finish("main", 10, &old).unwrap());
        assert!(!jobs.cancel("main", 10).unwrap());
        assert!(jobs.cancel("main", 11).unwrap());
        assert!(current.load(Ordering::Acquire));
        assert!(jobs.finish("main", 11, &current).unwrap());
        assert!(!jobs.cancel("main", 11).unwrap());
    }

    #[test]
    fn same_job_id_replacement_keeps_the_new_cancellation_slot() {
        let jobs = RetargetPreflightJobs::default();
        let old = jobs.begin("main", 4).unwrap();
        let current = jobs.begin("main", 4).unwrap();
        assert!(!jobs.finish("main", 4, &old).unwrap());
        assert!(jobs.cancel("main", 4).unwrap());
        assert!(current.load(Ordering::Acquire));
    }
}
