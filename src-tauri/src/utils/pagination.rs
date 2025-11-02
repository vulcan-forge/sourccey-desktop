use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaginationParameters {
    pub page: Option<usize>,
    pub page_size: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaginatedResponse<T>
where
    T: Serialize,
{
    pub data: Vec<T>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
    pub has_next: bool,
    pub has_previous: bool,
}
