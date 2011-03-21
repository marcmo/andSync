import Network.HTTP
import Network.Browser
import Network.URI(parseURI)
import qualified Text.JSON as J
import qualified Data.Set as S
import Maybe(fromJust)

import Test.Framework (defaultMain, testGroup)
import Test.Framework.Providers.HUnit
import Test.Framework.Providers.QuickCheck2 (testProperty)

import Test.QuickCheck
import Test.HUnit


main = defaultMain tests

tests = [
        testGroup "rest api Group" [
                -- testProperty "next" prop_next,
                testCase "create and delete user" test_createUser 
            ]
    ]


test_createUser = do
  (J.Ok initialUsers) <- getUsers >>= return . (fmap S.fromList)
  createUser "xyz"
  (J.Ok users2) <- getUsers >>= return . (fmap S.fromList)
  assertBool "should be one user more" $ (S.size users2) == (1 + S.size initialUsers)
  assertEqual "exactly the one new user" (users2 S.\\ initialUsers) (S.singleton "xyz")
  eraseOneUser "xyz"
  (J.Ok users3) <- getUsers >>= return . (fmap S.fromList)
  assertEqual "users should be as before again" (users3 S.\\ initialUsers) S.empty
  
  

serverUri x = parseURI $ "http://localhost:8080" ++ x
newUser = fromJust $ serverUri "/user/new"
listUsers = fromJust $ serverUri "/user/list"
eraseUser u = fromJust $ serverUri $ "/user/erase/" ++ u

-- /user/new => create new user with form, field should contain user name
-- /user/list => list all existing user, return user as JSON object
-- for specific users:
-- /user/upload/$USER => start upload-streaming for $USER
-- /user/sha1/$USER   => get sha1 checksum for $USER
-- /user/content/$USER => get all files of $USER, returns stringified
-- list of user files
-- /user/clear/$USER => delete all files of $USER
-- /user/get/$USER/$FILE => start download of $FILE from $USER

getUsers ::  IO (J.Result [String])
getUsers = do 
  let r = Request { rqURI = listUsers, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  simpleHTTP r >>= getResponseBody >>= return . J.decode

createUser ::  String -> IO ()
createUser user = do
  let f = Form POST newUser [("name", user)]
  Network.Browser.browse $ do { setAllowRedirects True; request $ formToRequest f}
  return ()

eraseOneUser :: String -> IO (J.Result [String])
eraseOneUser user = do
  let r = Request { rqURI = eraseUser user, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  rr <- simpleHTTP r >>= getResponseBody 
  return $ J.decode rr

  

