import axios from "axios";
import { toast } from "react-toastify";
import { handleLogoutAPI, refreshTokenAPI } from "~/apis";

let authorizeAxiosInstance = axios.create();

//set time chờ tối đa 1 request: 10p
authorizeAxiosInstance.defaults.timeout = 1000 * 60 * 10;

//withCredentialsL: cho phép axios tự động đính kèm và gửi cookie trong mỗi request lên BE (cơ chế httpOnly Cookie)
authorizeAxiosInstance.defaults.withCredentials = true;

// Add a request interceptor: can thiệp vào giữa các request API
authorizeAxiosInstance.interceptors.request.use(
  (config) => {
    //lấy accessToken từ localStorage và đính kèm vào header
    const accessToken = localStorage.getItem("accessToken");

    if (accessToken) {
      //thêm Bearer vì tuân thủ theo tiêu chuẩn OAuth 2.0 trong việc xác định loại token đang sử dụng
      //Bearer: định nghĩa loại token dành cho việc xác thực và ủy quyền
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    // Do something with request error
    return Promise.reject(error);
  }
);

//mục đích refreshTokenPromise để khi nhận yêu cầu refreshToken đầu tiên thì hold lại việc gọi API refreshToken cho tới khi xong xuôi thì mới retry lại những api lỗi trước đó
let refreshTokenPromise = null;

// Add a response interceptor: can thiệp vào giữa các response API
authorizeAxiosInstance.interceptors.response.use(
  (response) => {
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response;
  },
  (error) => {
    // xử lí refresh token tự động
    if (error.response?.status === 401) {
      handleLogoutAPI().then(() => {
        localStorage.removeItem("userInfo");

        location.href = "/login";
      });
    }

    //nếu nhận mã 410 từ BE, gọi api refresh token để làm mới accessToken
    const originalRequest = error.config;
    console.log("originalRequest: ", originalRequest);
    if (error.response?.status === 410 && originalRequest) {
      if (!refreshTokenPromise) {
        // lấy refreshToken từ LocalStorage (trường hợp LocalStorage)
        const refreshToken = localStorage.getItem("refreshToken");
        // gọi api refreshToken
        refreshTokenPromise = refreshTokenAPI(refreshToken)
          .then((res) => {
            //lấy và gán lại accessToken vào LocalStorage (trường hợp LocalStorage)
            const { accessToken } = res.data;
            localStorage.setItem("accessToken", accessToken);
            authorizeAxiosInstance.defaults.headers.Authorization = `Bearer ${accessToken}`;

            // đồng thời lưu ý là access token cũng đã được update lại cookie (trường hợp cookie)
          })
          .catch((_error) => {
            // nếu nhận bất kì lỗi nào từ api refresh token ==> logout luôn
            console.log("error: ", _error);
            handleLogoutAPI().then(() => {
              localStorage.removeItem("userInfo");

              location.href = "/login";
            });
            return Promise.reject(_error);
          })
          .finally(() => {
            //dù API refreshToken có thành công hay không hay lỗi thì vẫn luôn gán lại refreshTokenPromise về null như ban đầu
            refreshTokenPromise = null;
          });
      }
      // cuối cùng return lại refreshTokenPromise trong trường hợp success ở đây
      return refreshTokenPromise.then(() => {
        // (quan trọng): return lại axios instance  kết hợp cái originalConfig để gọi lại những api ban đầu bị lỗi
        return authorizeAxiosInstance(originalRequest);
      });
    }

    // xử lí lỗi tập trung phần hiển thị thông báo lỗi trả về từ mọi API (viết code 1 lần: clean code)
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error

    if (error.response?.status !== 410) {
      toast.error(error.response?.data?.message || error?.message);
    }
    return Promise.reject(error);
  }
);

export default authorizeAxiosInstance;
