# DefaultApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**sunreiSpotsGet**](#sunreispotsget) | **GET** /sunrei-spots | List Sunrei Spots with filters|
|[**sunreisGet**](#sunreisget) | **GET** /sunreis | List Sunrei with optional polygon filter|
|[**sunreisIdGet**](#sunreisidget) | **GET** /sunreis/{id} | Get Sunrei by ID|

# **sunreiSpotsGet**
> Array<SunreiSpotDTO> sunreiSpotsGet()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let lat: number; // (default to undefined)
let lng: number; // (default to undefined)
let radius: number; // (default to undefined)

const { status, data } = await apiInstance.sunreiSpotsGet(
    lat,
    lng,
    radius
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **lat** | [**number**] |  | defaults to undefined|
| **lng** | [**number**] |  | defaults to undefined|
| **radius** | [**number**] |  | defaults to undefined|


### Return type

**Array<SunreiSpotDTO>**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Filtered list of Sunrei Spots |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **sunreisGet**
> ListSunreiResult sunreisGet()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let polygon: string; //JSON string of coordinate array forming a polygon to filter results (e.g., \"[[35.6762,139.6503],[35.6795,139.7005],[35.6585,139.7454]]\") (optional) (default to undefined)

const { status, data } = await apiInstance.sunreisGet(
    polygon
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **polygon** | [**string**] | JSON string of coordinate array forming a polygon to filter results (e.g., \&quot;[[35.6762,139.6503],[35.6795,139.7005],[35.6585,139.7454]]\&quot;) | (optional) defaults to undefined|


### Return type

**ListSunreiResult**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | List of Sunrei (all or filtered by polygon) |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **sunreisIdGet**
> GetSunreiResult sunreisIdGet()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; //ID of the Sunrei to retrieve (default to undefined)

const { status, data } = await apiInstance.sunreisIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] | ID of the Sunrei to retrieve | defaults to undefined|


### Return type

**GetSunreiResult**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Details of the Sunrei |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

