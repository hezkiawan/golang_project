package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
)

// change these to a user that exists in your db
const email = "user1@mail.com"
const password = "user1password"
const serviceID = 1
const total = 20

func main() {

	// date comes from the command line, so every run can use a fresh date
	if len(os.Args) < 2 {
		log.Fatal("usage: go run ./cmd/racetest 2026-11-20")
	}
	date := os.Args[1]

	// 1. login once to get the jwt cookie
	loginBody, _ := json.Marshal(map[string]string{
		"email":    email,
		"password": password,
	})

	resp, err := http.Post("http://localhost:3003/auth/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		log.Fatal(err)
	}
	resp.Body.Close()

	// find the "jwt" cookie from the login response
	var jwtCookie *http.Cookie
	for _, cookie := range resp.Cookies() {
		if cookie.Name == "jwt" {
			jwtCookie = cookie
		}
	}
	if jwtCookie == nil {
		log.Fatal("login failed, no jwt cookie (check email/password)")
	}

	// 2. the booking body, every goroutine sends the SAME service + date
	bookingBody, _ := json.Marshal(map[string]any{
		"service_id":   serviceID,
		"booking_date": date,
	})

	var wg sync.WaitGroup        // waits until all goroutines are done
	start := make(chan struct{}) // the "starting gun"
	var mu sync.Mutex            // protects the results map
	results := map[int]int{}     // status code -> how many times

	// 3. start 20 goroutines, they all wait at <-start
	for i := 0; i < total; i++ {
		wg.Add(1)

		go func() {
			defer wg.Done()

			<-start // block here until start is closed

			// each goroutine needs its OWN reader, a reader can only be read once
			req, _ := http.NewRequest("POST", "http://localhost:3001/bookings", bytes.NewReader(bookingBody))
			req.Header.Set("Content-Type", "application/json")
			req.AddCookie(jwtCookie)

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				log.Println(err)
				return
			}
			resp.Body.Close()

			// many goroutines write to the same map -> lock it
			mu.Lock()
			results[resp.StatusCode]++
			mu.Unlock()
		}()
	}

	fmt.Printf("sending %d bookings for service %d on %s at the same time...\n", total, serviceID, date)

	// 4. fire! closing a channel wakes up EVERY goroutine waiting on it at once
	close(start)

	// 5. wait for all 20 to finish
	wg.Wait()

	for code, count := range results {
		fmt.Printf("%d %s : %d\n", code, http.StatusText(code), count)
	}
}
